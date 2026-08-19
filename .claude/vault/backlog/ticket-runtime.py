#!/usr/bin/env python3
"""Persistent, fenced ticket ownership for day/night handoff."""
import argparse, contextlib, fcntl, hashlib, hmac, json, math, os, re, secrets, stat, subprocess, sys, tempfile, time

TICKET_ID = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$")
ACTORS = {"jh", "hs"}
ROOT_PARTS = (".claude", "vault", "backlog", "tickets")


def now(): return float(os.environ.get("TICKET_RUNTIME_NOW", time.time()))
def canonical_json(value): return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode()
def fail(message): raise ValueError(message)
def lease(value):
    if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value) or not 1 <= value <= 3600: fail("lease-seconds must be a finite number from 1 to 3600")
    return value
def fsync_dir(path):
    fd = os.open(path, os.O_RDONLY)
    try: os.fsync(fd)
    finally: os.close(fd)

def no_symlink(path, allow_missing=False):
    path = os.path.abspath(path)
    current = os.path.sep
    parts = path.split(os.path.sep)[1:]
    for index, part in enumerate(parts):
        current = os.path.join(current, part)
        try: item = os.lstat(current)
        except FileNotFoundError:
            if allow_missing: break
            raise
        if stat.S_ISLNK(item.st_mode): fail(f"symlink component is not allowed: {current}")
    return path

def project_root(value):
    canonical = os.path.realpath(os.path.abspath(os.path.expanduser(value)))
    no_symlink(canonical)
    if not os.path.isdir(canonical): fail("project must be a directory")
    return canonical
def beneath(root, value, allow_missing=False):
    raw = os.path.abspath(os.path.expanduser(value))
    try:
        if stat.S_ISLNK(os.lstat(raw).st_mode):
            fail("symlink component is not allowed")
    except FileNotFoundError:
        if not allow_missing:
            raise
    canonical = os.path.realpath(raw)
    no_symlink(canonical, allow_missing)
    if os.path.commonpath((root, canonical)) != root: fail("path escapes project root")
    return canonical

def ticket(root, ticket_id):
    if not TICKET_ID.fullmatch(ticket_id): fail("invalid ticket id")
    path = os.path.join(root, *ROOT_PARTS, ticket_id + ".md")
    no_symlink(path)
    entry = os.lstat(path)
    if not stat.S_ISREG(entry.st_mode): fail("ticket must be a regular file")
    return path

def paths(root, tid):
    base = os.path.join(root, *ROOT_PARTS)
    # Existing components must not turn persistent state into a symlink escape.
    no_symlink(base, True)
    state_dir = os.path.join(base, "state")
    check_dir = os.path.join(base, "checkpoints", tid)
    for path in (state_dir, check_dir):
        no_symlink(path, True)
        os.makedirs(path, mode=0o700, exist_ok=True)
        os.chmod(path, 0o700)
    return state_dir, os.path.join(state_dir, tid + ".json"), check_dir

def authority_key(state_dir):
    key = os.path.join(state_dir, ".authority-key")
    try:
        item = os.lstat(key)
        if stat.S_ISLNK(item.st_mode) or not stat.S_ISREG(item.st_mode) or stat.S_IMODE(item.st_mode) != 0o600 or item.st_size != 32: fail("invalid authority key")
        with open(key, "rb") as fh: return fh.read()
    except FileNotFoundError:
        data = secrets.token_bytes(32); temp = key + ".tmp-" + secrets.token_hex(8)
        fd = os.open(temp, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        with os.fdopen(fd, "wb") as fh: fh.write(data); fh.flush(); os.fsync(fh.fileno())
        try: os.link(temp, key)
        except FileExistsError: pass
        finally: os.unlink(temp)
        fsync_dir(state_dir)
        return authority_key(state_dir)

def signature(key, state):
    payload = dict(state); payload.pop("authority_hmac", None)
    return hmac.new(key, canonical_json(payload), hashlib.sha256).hexdigest()
def verify(state, state_dir):
    if state.get("schema") != 1 or not isinstance(state.get("authority_hmac"), str): fail("invalid state authority")
    actual = signature(authority_key(state_dir), state)
    if not hmac.compare_digest(actual, state["authority_hmac"]): fail("state authority hmac mismatch")

def load(state_path, state_dir):
    try:
        no_symlink(state_path)
        with open(state_path, encoding="utf-8") as fh:
            state = json.load(fh)
    except FileNotFoundError: return None
    except (OSError, json.JSONDecodeError) as exc: raise ValueError("invalid state") from exc
    verify(state, state_dir); return state

def write_state(path, state_dir, state):
    state["authority_hmac"] = signature(authority_key(state_dir), state)
    data = canonical_json(state); temp = path + ".tmp-" + secrets.token_hex(8)
    fd = os.open(temp, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(fd, "wb") as fh: fh.write(data); fh.flush(); os.fsync(fh.fileno())
    os.replace(temp, path); os.chmod(path, 0o600); fsync_dir(state_dir)

@contextlib.contextmanager
def locked(state_dir, tid):
    lock = os.path.join(state_dir, tid + ".lock")
    fd = os.open(lock, os.O_CREAT | os.O_RDWR, 0o600)
    try:
        fcntl.flock(fd, fcntl.LOCK_EX); yield
    finally: os.close(fd)

@contextlib.contextmanager
def globally_locked(state_dir):
    with locked(state_dir, ".global"):
        yield

def run_git(worktree, *args):
    process = subprocess.run(["git", "-C", worktree, *args], stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    if process.returncode: fail("git " + " ".join(args) + " failed: " + process.stderr.decode(errors="replace").strip())
    return process.stdout

def worktree_info(root, worktree, reference=False):
    canonical = beneath(root, worktree)
    if reference:
        if canonical != root: fail("reference-only-main worktree must equal project root")
        return {"path": canonical, "branch": None, "head": run_git(canonical, "rev-parse", "HEAD").decode().strip()}
    permitted = os.path.join(root, ".claude", "worktrees")
    no_symlink(permitted, True)
    if os.path.commonpath((permitted, canonical)) != permitted: fail("ticket worktree must be below .claude/worktrees")
    output = run_git(root, "worktree", "list", "--porcelain").decode().splitlines()
    entries, current = [], {}
    for line in output + [""]:
        if not line:
            if current: entries.append(current); current = {}
        elif " " in line: key, value = line.split(" ", 1); current[key] = value
        else: current[line] = True
    found = next((item for item in entries if os.path.realpath(item.get("worktree", "")) == canonical), None)
    if not found or "branch" not in found: fail("worktree must be registered and have a branch")
    return {"path": canonical, "branch": found["branch"], "head": run_git(canonical, "rev-parse", "HEAD").decode().strip()}

def porcelain(worktree):
    raw = run_git(worktree, "status", "--porcelain=v1", "--untracked-files=all", "-z")
    items, index = [], 0
    parts = raw.split(b"\0")
    while index < len(parts):
        item = parts[index]; index += 1
        if not item: continue
        if len(item) < 4: fail("invalid git status")
        path = item[3:].decode("utf-8", "surrogateescape"); items.append(path)
        if item[:1] in (b"R", b"C") or item[1:2] in (b"R", b"C"): index += 1
    return sorted(items)

def patch_bytes(worktree, files):
    data = bytearray(run_git(worktree, "diff", "--binary", "HEAD"))
    untracked = set(run_git(worktree, "ls-files", "--others", "--exclude-standard", "-z").decode("utf-8", "surrogateescape").split("\0"))
    for name in files:
        # Only untracked files are absent from git diff; --no-index provides a binary, replayable patch.
        if name in untracked:
            process = subprocess.run(["git", "diff", "--binary", "--no-index", "--", "/dev/null", name], cwd=worktree, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
            if process.returncode not in (0, 1): fail("could not build untracked patch")
            data.extend(process.stdout)
    return bytes(data)

def publish(directory, suffix, data):
    digest = hashlib.sha256(data).hexdigest(); final = os.path.join(directory, digest + suffix)
    temp = final + ".tmp-" + secrets.token_hex(8)
    fd = os.open(temp, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(fd, "wb") as fh: fh.write(data); fh.flush(); os.fsync(fh.fileno())
    try: os.link(temp, final)
    except FileExistsError:
        with open(final, "rb") as fh:
            if fh.read() != data: fail("content-address collision")
    finally: os.unlink(temp)
    os.chmod(final, 0o600); fsync_dir(directory)
    return final, digest

def content_file(directory, path, digest, suffix):
    if not isinstance(path, str) or not isinstance(digest, str) or not re.fullmatch(r"[0-9a-f]{64}", digest): fail("invalid checkpoint artifact")
    directory = os.path.realpath(directory)
    if os.path.dirname(path) != directory or os.path.basename(path) != digest + suffix: fail("checkpoint artifact escapes directory")
    no_symlink(directory); no_symlink(path)
    item = os.lstat(path)
    if not stat.S_ISREG(item.st_mode): fail("checkpoint artifact must be a regular file")
    data = open(path, "rb").read()
    if hashlib.sha256(data).hexdigest() != digest: fail("checkpoint artifact hash mismatch")
    return data

def checkpoint_data(state):
    path = state.get("latest_checkpoint_path"); digest = state.get("latest_checkpoint_hash")
    directory = os.path.join(state["project_root"], *ROOT_PARTS, "checkpoints", state["ticket_id"])
    data = content_file(directory, path, digest, ".json")
    value = json.loads(data)
    if any(value.get(key) != state.get(key) for key in ("ticket_id", "actor", "worktree")) or value.get("sequence") != state.get("latest_checkpoint_sequence"): fail("checkpoint state mismatch")
    if state["workspace_mode"] == "ticket-worktree":
        content_file(directory, value.get("patch_path"), value.get("patch_hash"), ".patch")
    elif value.get("patch_path") is not None or value.get("patch_hash") is not None: fail("reference checkpoint has patch")
    return value

def checkpoint_valid(state):
    try: checkpoint_data(state); return True
    except (OSError, ValueError, json.JSONDecodeError): return False

def classification(state):
    if state["status"] == "released": return "released"
    if state["status"] == "manual_review": return "manual_review"
    if state["workspace_mode"] == "reference-only-main": return "reference_only"
    fresh = state["lease_until"] > now()
    if state["status"] in {"claimed", "running"} and fresh: return "active"
    if (state["status"] == "paused" or not fresh) and checkpoint_valid(state): return "takeover_ready"
    return "manual_review"

def ensure_owner(state, args):
    if state["owner_session_id"] != args.session_id or state["owner_token"] != args.owner_token or int(state["fencing"]) != int(args.fencing): fail("stale owner, session, or fencing")

def ensure_unique(root, state_dir, tid, worktree, reference, actor, session_id):
    for name in os.listdir(state_dir):
        if not name.endswith(".json") or name == tid + ".json": continue
        other = load(os.path.join(state_dir, name), state_dir)
        if other and other.get("worktree") == worktree and other.get("status") != "released":
            if reference and other.get("workspace_mode") == "reference-only-main" and other.get("actor") == actor and other.get("owner_session_id") == session_id:
                continue
            fail("worktree is reserved by another ticket")

def record(state):
    return {key: state.get(key) for key in ("ticket_id", "actor", "owner_kind", "owner_session_id", "session_history", "fencing", "status", "lease_until", "heartbeat_at", "project_root", "worktree", "workspace_mode", "latest_checkpoint_path", "latest_checkpoint_hash", "latest_checkpoint_sequence")} | {"classification": classification(state), "checkpoint_valid": checkpoint_valid(state)}

def claim(args, takeover=False):
    root = project_root(args.project); ticket(root, args.ticket_id); state_dir, state_path, _ = paths(root, args.ticket_id)
    if args.actor not in ACTORS: fail("invalid actor")
    lease(args.lease_seconds)
    reference = bool(getattr(args, "reference_only_main", False))
    if takeover and (args.owner_kind != "night" or reference): fail("takeover requires night ticket-worktree")
    with globally_locked(state_dir):
        with locked(state_dir, args.ticket_id):
            info = worktree_info(root, args.worktree, reference)
            old = load(state_path, state_dir)
            if old:
                kind = classification(old)
                if not takeover:
                    if kind != "released": fail("ticket is already claimed")
                else:
                    if old["workspace_mode"] == "reference-only-main": fail("reference-only-main cannot be taken over")
                    if old["actor"] != args.actor: fail("takeover actor must match the ticket actor")
                    if kind == "active": fail("fresh ticket cannot be taken over")
                    if kind == "manual_review": fail("expired ticket has no valid checkpoint")
                    if old["worktree"] != info["path"]: fail("takeover must use ticket worktree")
                    try:
                        value = checkpoint_data(old)
                        if any(value.get(key) != old.get(key) for key in ("ticket_id", "actor", "worktree")) or value.get("branch") != info["branch"] or value.get("head") != info["head"] or value.get("sequence") != old["latest_checkpoint_sequence"] or value.get("patch_hash") is None: fail("checkpoint identity mismatch")
                        actual = porcelain(info["path"])
                        if actual != value.get("changed_files"): fail("worktree drift since checkpoint")
                        regenerated = patch_bytes(info["path"], actual)
                        if hashlib.sha256(regenerated).hexdigest() != value["patch_hash"]: fail("worktree patch drift since checkpoint")
                        patch = content_file(os.path.join(root, *ROOT_PARTS, "checkpoints", args.ticket_id), value["patch_path"], value["patch_hash"], ".patch")
                        process = subprocess.run(["git", "-C", info["path"], "apply", "--check", "--reverse", "--allow-empty", "-"], input=patch, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
                        if process.returncode: fail("checkpoint patch cannot reverse-apply to worktree")
                    except (OSError, ValueError, json.JSONDecodeError):
                        old["status"] = "manual_review"; old["lease_until"] = now(); old["heartbeat_at"] = now()
                        write_state(state_path, state_dir, old)
                        raise ValueError("worktree drift requires manual review")
            ensure_unique(root, state_dir, args.ticket_id, info["path"], reference, args.actor, args.session_id)
            fencing = (int(old["fencing"]) if old else 0) + 1
            continuing = old if takeover else {}
            history = list(dict.fromkeys((continuing.get("session_history", []) + ([old["owner_session_id"]] if takeover else []))))
            state = {"schema": 1, "ticket_id": args.ticket_id, "actor": args.actor, "owner_kind": args.owner_kind, "owner_session_id": args.session_id, "session_history": history, "owner_token": "tok_" + secrets.token_urlsafe(32), "fencing": fencing, "status": "claimed", "lease_until": now()+args.lease_seconds, "heartbeat_at": now(), "project_root": root, "worktree": info["path"], "workspace_mode": "reference-only-main" if reference else "ticket-worktree", "latest_checkpoint_path": continuing.get("latest_checkpoint_path"), "latest_checkpoint_hash": continuing.get("latest_checkpoint_hash"), "latest_checkpoint_sequence": continuing.get("latest_checkpoint_sequence", 0)}
            write_state(state_path, state_dir, state)
    return record(state) | {"owner_token": state["owner_token"]}

def heartbeat(args):
    root = project_root(args.project); ticket(root,args.ticket_id); state_dir,path,_=paths(root,args.ticket_id)
    lease(args.lease_seconds)
    with locked(state_dir,args.ticket_id):
        state=load(path,state_dir)
        if not state: fail("ticket is not claimed")
        ensure_owner(state,args)
        if state["status"] not in {"claimed","running"} or state["lease_until"] <= now(): fail("lease is not active")
        worktree_info(root,state["worktree"],state["workspace_mode"]=="reference-only-main")
        state.update(status="running", heartbeat_at=now(), lease_until=now()+args.lease_seconds); write_state(path,state_dir,state)
    return record(state)

def checkpoint(args):
    root=project_root(args.project); ticket(root,args.ticket_id); state_dir,path,cpdir=paths(root,args.ticket_id)
    lease(args.lease_seconds)
    try: supplied=json.loads(args.input)
    except json.JSONDecodeError as exc: raise ValueError("checkpoint input must be json") from exc
    required={"objective":str,"completed":list,"remaining":list,"tests":list,"blockers":list,"next_action":str,"changed_files":list}
    if set(supplied) != set(required) or any(not isinstance(supplied[k], typ) for k,typ in required.items()) or any(not all(isinstance(x,str) for x in supplied[k]) for k in ("completed","remaining","tests","blockers","changed_files")): fail("invalid checkpoint input schema")
    with locked(state_dir,args.ticket_id):
        state=load(path,state_dir)
        if not state: fail("ticket is not claimed")
        ensure_owner(state,args)
        if state["status"] not in {"claimed","running"} or state["lease_until"] <= now(): fail("lease is not active")
        reference=state["workspace_mode"]=="reference-only-main"; info=worktree_info(root,state["worktree"],reference)
        actual=porcelain(info["path"])
        if sorted(supplied["changed_files"]) != actual: fail("changed_files must exactly match git status")
        sequence=int(state.get("latest_checkpoint_sequence",0))+1
        value=dict(
            supplied, changed_files=actual, schema=1, ticket_id=args.ticket_id,
            actor=state["actor"], session_id=args.session_id, fencing=state["fencing"],
            worktree=info["path"], workspace_mode=state["workspace_mode"],
            branch=info["branch"], head=info["head"], status=args.status,
            timestamp=now(), sequence=sequence,
        )
        if not reference:
            patch, patch_hash=publish(cpdir,".patch",patch_bytes(info["path"],actual)); value["patch_path"],value["patch_hash"]=patch,patch_hash
        else: value["patch_path"],value["patch_hash"]=None,None
        cp, digest=publish(cpdir,".json",canonical_json(value))
        state.update(latest_checkpoint_path=cp,latest_checkpoint_hash=digest,latest_checkpoint_sequence=sequence,heartbeat_at=now(),lease_until=(now() if args.status=="paused" else now()+args.lease_seconds),status=("paused" if args.status=="paused" else "running")); write_state(path,state_dir,state)
    return record(state)

def release(args):
    root=project_root(args.project);ticket(root,args.ticket_id);state_dir,path,_=paths(root,args.ticket_id)
    with locked(state_dir,args.ticket_id):
        state=load(path,state_dir)
        if not state: fail("ticket is not claimed")
        ensure_owner(state,args)
        if args.status == "paused":
            if state["status"] != "paused" or not checkpoint_valid(state): fail("paused release requires its valid paused checkpoint")
            value = checkpoint_data(state)
            if value.get("status") != "paused": fail("paused release requires its valid paused checkpoint")
            return record(state)
        if state["status"] in {"claimed", "running"}:
            if state["lease_until"] <= now(): fail("lease is not active")
        elif state["status"] == "paused":
            value = checkpoint_data(state)
            if value.get("status") != "paused": fail("released transition requires paused checkpoint")
        else:
            fail("released transition requires active lease or paused checkpoint")
        state["status"]=args.status; state["lease_until"]=now(); state["heartbeat_at"]=now(); write_state(path,state_dir,state)
    return record(state)

def status(args):
    root=project_root(args.project);ticket(root,args.ticket_id);state_dir,path,_=paths(root,args.ticket_id); state=load(path,state_dir)
    if not state: return {"ticket_id":args.ticket_id,"classification":"released","checkpoint_valid":False}
    return record(state)
def list_states(args):
    root=project_root(args.project); state_dir=os.path.join(root,*ROOT_PARTS,"state")
    no_symlink(state_dir,True)
    if not os.path.isdir(state_dir): return {"actor":args.actor,"tickets":[]}
    result=[]
    for name in sorted(os.listdir(state_dir)):
        if name.endswith(".json"):
            state=load(os.path.join(state_dir,name),state_dir)
            if state.get("actor")==args.actor: result.append(record(state))
    return {"actor":args.actor,"tickets":result}

def parser():
    p=argparse.ArgumentParser(); commands=p.add_subparsers(dest="command",required=True)
    def shared(name, owner=False):
        sub=commands.add_parser(name); sub.add_argument("--project",required=True);sub.add_argument("--ticket-id",required=True)
        if owner: sub.add_argument("--session-id",required=True);sub.add_argument("--owner-token",required=True);sub.add_argument("--fencing",required=True,type=int)
        return sub
    for name in ("claim","takeover"):
        sub=shared(name);sub.add_argument("--actor",required=True,choices=ACTORS);sub.add_argument("--session-id",required=True);sub.add_argument("--owner-kind",required=True,choices=("day","night"));sub.add_argument("--worktree",required=True);sub.add_argument("--lease-seconds",required=True,type=float)
        if name=="claim": sub.add_argument("--reference-only-main",action="store_true")
    sub=shared("heartbeat",True);sub.add_argument("--lease-seconds",required=True,type=float)
    sub=shared("checkpoint",True);sub.add_argument("--input",required=True);sub.add_argument("--status",required=True,choices=("running","paused"));sub.add_argument("--lease-seconds",required=True,type=float)
    sub=shared("release",True);sub.add_argument("--status",required=True,choices=("paused","released"))
    shared("status"); sub=commands.add_parser("list");sub.add_argument("--project",required=True);sub.add_argument("--actor",required=True,choices=ACTORS)
    return p
def main():
    args=parser().parse_args()
    try:
        action={"claim":lambda:claim(args),"takeover":lambda:claim(args,True),"heartbeat":lambda:heartbeat(args),"checkpoint":lambda:checkpoint(args),"release":lambda:release(args),"status":lambda:status(args),"list":lambda:list_states(args)}[args.command]
        print(json.dumps(action(),ensure_ascii=False,sort_keys=True))
    except (ValueError,OSError) as exc:
        print(str(exc),file=sys.stderr); return 1
    return 0
if __name__=="__main__": sys.exit(main())
