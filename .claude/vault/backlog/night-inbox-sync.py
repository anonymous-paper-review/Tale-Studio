#!/usr/bin/env python3
"""Synchronize append-only nightly inbox input without touching unrelated files."""
import argparse
import json
import os
import subprocess
import sys
import tempfile
import uuid

INBOX_REL = ".claude/vault/_INBOX.md"
REMOTE = "origin"


class SyncError(Exception):
    """A synchronization operation could not be completed safely."""


class MergeConflict(SyncError):
    def __init__(self, reason):
        super().__init__(reason)
        self.reason = reason


def _git(project, args, *, env=None):
    command = ["git", "-C", project, *args]
    return subprocess.run(command, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                          check=False, env=env)


def _git_checked(project, args, *, env=None):
    result = _git(project, args, env=env)
    if result.returncode != 0:
        detail = result.stderr.decode("utf-8", "replace").strip()
        command = " ".join(args)
        raise SyncError(f"git {command} 실패" + (f": {detail}" if detail else ""))
    return result.stdout


def _decode(data):
    return data.decode("utf-8", "surrogateescape")


def _ref_sha(project, ref):
    result = _git(project, ["rev-parse", "--verify", ref])
    if result.returncode != 0:
        return None
    return _decode(result.stdout).strip()


def _show_file(project, revision, path):
    result = _git(project, ["show", f"{revision}:{path}"])
    if result.returncode != 0:
        raise MergeConflict("merge-conflict: inbox common base 또는 branch 파일이 없다")
    return result.stdout


def _name_list(project, args):
    result = _git_checked(project, [*args, "--"])
    return [item.decode("utf-8", "surrogateescape") for item in result.split(b"\0") if item]


def _working_paths(project):
    raw = _git_checked(project, ["status", "--porcelain=v1", "-z", "--untracked-files=all"])
    values = raw.split(b"\0")
    names = []
    index = 0
    while index < len(values):
        item = values[index]
        index += 1
        if not item:
            continue
        if len(item) < 3:
            raise SyncError("git status 출력이 올바르지 않다")
        status = item[:2].decode("ascii", "replace")
        names.append(item[3:].decode("utf-8", "surrogateescape"))
        # Porcelain -z puts the original name after a rename/copy entry.
        if "R" in status or "C" in status:
            if index >= len(values) or not values[index]:
                raise SyncError("git status rename 출력이 올바르지 않다")
            names.append(values[index].decode("utf-8", "surrogateescape"))
            index += 1
    return names


def _atomic_write(path, data):
    parent = os.path.dirname(path) or "."
    os.makedirs(parent, exist_ok=True)
    temporary = f"{path}.tmp-{os.getpid()}-{uuid.uuid4().hex}"
    try:
        with open(temporary, "wb") as handle:
            handle.write(data)
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(temporary, path)
    finally:
        try:
            os.unlink(temporary)
        except FileNotFoundError:
            pass


def _branch_name(project, supplied):
    actual = _decode(_git_checked(project, ["symbolic-ref", "--quiet", "--short", "HEAD"])).strip()
    if supplied is not None and supplied != actual:
        raise SyncError(f"현재 branch와 요청 branch가 다르다: {actual} != {supplied}")
    checked = supplied or actual
    if _git(project, ["check-ref-format", "--branch", checked]).returncode != 0:
        raise SyncError("branch 이름이 올바르지 않다")
    return checked


def _ensure_only_inbox(project, paths):
    unexpected = sorted(set(paths) - {INBOX_REL})
    if unexpected:
        raise MergeConflict("merge-conflict: inbox 이외의 working tree 변경이 있다: " + ", ".join(unexpected))


def _append_union(base, local, remote):
    if not local.startswith(base) or not remote.startswith(base):
        raise MergeConflict("merge-conflict: 공통 base가 rewrite 또는 delete 되었다")
    local_tail = local[len(base):]
    remote_tail = remote[len(base):]
    if not local_tail:
        return base + remote_tail, False
    if not remote_tail:
        return base + local_tail, False
    if local_tail == remote_tail:
        return base + local_tail, False
    if local_tail.startswith(remote_tail):
        return base + local_tail, True
    if remote_tail.startswith(local_tail):
        return base + remote_tail, True
    separator = b"" if local_tail.endswith((b"\n", b"\r")) else b"\n"
    return base + local_tail + separator + remote_tail, True


def _inbox_commits(project, base, revision):
    result = _git(project, [
        "log", "--format=%H%x00%an%x00%ae%x00%aI", f"{base}..{revision}", "--", INBOX_REL,
    ])
    if result.returncode != 0:
        return []
    fields = result.stdout.split(b"\n")
    commits = []
    for row in fields:
        values = row.split(b"\0")
        if len(values) != 4 or not values[0]:
            continue
        commits.append({
            "commit": _decode(values[0]),
            "author": _decode(values[1]),
            "email": _decode(values[2]),
            "committed_at": _decode(values[3]),
        })
    return commits


def _write_blob(project, content):
    result = subprocess.run(["git", "-C", project, "hash-object", "-w", "--stdin"],
                            input=content, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                            check=False)
    if result.returncode != 0:
        detail = result.stderr.decode("utf-8", "replace").strip()
        raise SyncError("inbox blob 생성 실패" + (f": {detail}" if detail else ""))
    return _decode(result.stdout).strip()


def _commit_tree(project, branch, local_sha, parents, blob, message):
    with tempfile.TemporaryDirectory(prefix="night-inbox-index-") as temporary:
        index_path = os.path.join(temporary, "index")
        env = os.environ.copy()
        env["GIT_INDEX_FILE"] = index_path
        _git_checked(project, ["read-tree", local_sha], env=env)
        _git_checked(project, ["update-index", "--add", "--cacheinfo",
                              f"100644,{blob},{INBOX_REL}"], env=env)
        tree = _decode(_git_checked(project, ["write-tree"], env=env)).strip()
        commit_args = ["commit-tree", tree]
        for parent in parents:
            commit_args.extend(["-p", parent])
        commit_args.extend(["-m", message])
        commit = _decode(_git_checked(project, commit_args)).strip()
    if not commit:
        raise SyncError("inbox 동기화 commit SHA가 비어 있다")
    return commit


def _update_index(project, blob):
    _git_checked(project, ["update-index", "--add", "--cacheinfo",
                          f"100644,{blob},{INBOX_REL}"])


def _update_ref(project, branch, new_sha, old_sha):
    _git_checked(project, ["update-ref", f"refs/heads/{branch}", new_sha, old_sha])


def synchronize(args):
    project = os.path.realpath(os.path.abspath(os.path.expanduser(args.project)))
    if not os.path.isdir(os.path.join(project, ".git")):
        raise SyncError("project가 git worktree가 아니다")
    branch = _branch_name(project, args.branch)
    inbox_path = os.path.join(project, INBOX_REL)
    if not os.path.isfile(inbox_path):
        raise MergeConflict("merge-conflict: _INBOX.md가 삭제되었다")
    _ensure_only_inbox(project, _working_paths(project))

    local_sha = _ref_sha(project, "HEAD")
    if local_sha is None:
        raise SyncError("현재 commit을 확인할 수 없다")
    local_tree = _show_file(project, local_sha, INBOX_REL)
    with open(inbox_path, "rb") as handle:
        current = handle.read()

    remote_available = False
    remote_sha = None
    remote_error = None
    origin_url = _git(project, ["remote", "get-url", REMOTE])
    if not args.dry_run and origin_url.returncode == 0:
        fetched = _git(project, ["fetch", "--prune", REMOTE, branch])
        if fetched.returncode != 0:
            detail = fetched.stderr.decode("utf-8", "replace").strip()
            raise SyncError("remote fetch 실패" + (f": {detail}" if detail else ""))
        remote_sha = _ref_sha(project, f"refs/remotes/{REMOTE}/{branch}")
        remote_available = remote_sha is not None and fetched.returncode == 0
    elif args.dry_run:
        remote_sha = _ref_sha(project, f"refs/remotes/{REMOTE}/{branch}")
        remote_available = remote_sha is not None
    else:
        remote_error = "origin remote가 없다"

    friend_input = False
    unioned = False
    merged = current
    base_sha = local_sha
    remote_tree = local_tree
    remote_inbox_commits = []
    if remote_available:
        base_sha = _decode(_git_checked(project, ["merge-base", local_sha, remote_sha])).strip()
        local_names = _name_list(project, ["diff", "--name-only", "-z", base_sha, local_sha])
        remote_names = _name_list(project, ["diff", "--name-only", "-z", base_sha, remote_sha])
        _ensure_only_inbox(project, local_names + remote_names)
        base_tree = _show_file(project, base_sha, INBOX_REL)
        remote_tree = _show_file(project, remote_sha, INBOX_REL)
        remote_inbox_commits = _inbox_commits(project, base_sha, remote_sha)
        if not local_tree.startswith(base_tree) or not remote_tree.startswith(base_tree) or not current.startswith(base_tree):
            raise MergeConflict("merge-conflict: 공통 base가 rewrite 또는 delete 되었다")
        friend_input = remote_tree != base_tree
        merged, unioned = _append_union(base_tree, current, remote_tree)
    else:
        # Even without a remote, a local rewrite is not an append-only change.
        if not current.startswith(local_tree):
            raise MergeConflict("merge-conflict: local _INBOX.md가 append-only 규칙을 어겼다")
        merged = current

    content_changed = merged != local_tree
    needs_branch_sync = remote_available and remote_sha != local_sha
    commit_sha = None
    pushed = False
    fast_forwarded = False
    if args.dry_run:
        return {
            "status": "ok",
            "project": project,
            "branch": branch,
            "remote": REMOTE,
            "remote_available": remote_available,
            "remote_error": remote_error,
            "local_commit_sha": local_sha,
            "remote_commit_sha": remote_sha,
            "local_sha": local_sha,
            "remote_sha": remote_sha,
            "friend_input_present": friend_input,
            "remote_inbox_commits": remote_inbox_commits,
            "mechanically_unioned": unioned,
            "would_change_inbox": content_changed,
            "would_sync_branch": needs_branch_sync,
            "committed": False,
            "pushed": False,
            "dry_run": True,
        }

    if not content_changed and not needs_branch_sync:
        return {
            "status": "ok",
            "project": project,
            "branch": branch,
            "remote": REMOTE,
            "remote_available": remote_available,
            "remote_error": remote_error,
            "local_commit_sha": local_sha,
            "remote_commit_sha": remote_sha,
            "local_sha": local_sha,
            "remote_sha": remote_sha,
            "friend_input_present": friend_input,
            "remote_inbox_commits": remote_inbox_commits,
            "mechanically_unioned": unioned,
            "changed": False,
            "committed": False,
            "pushed": False,
            "dry_run": False,
        }

    blob = _write_blob(project, merged)
    final_sha = local_sha
    local_is_ancestor = (
        remote_available and remote_sha != local_sha
        and _git(project, ["merge-base", "--is-ancestor", local_sha, remote_sha]).returncode == 0
    )
    remote_is_ancestor = (
        remote_available and remote_sha != local_sha
        and _git(project, ["merge-base", "--is-ancestor", remote_sha, local_sha]).returncode == 0
    )
    if local_is_ancestor and not content_changed:
        # A pure remote fast-forward needs no synthetic commit.
        _update_ref(project, branch, remote_sha, local_sha)
        final_sha = remote_sha
        fast_forwarded = True
    elif remote_is_ancestor and not content_changed:
        # Local inbox-only commits are already the desired tree; only publish
        # them. Creating an empty merge commit would add no synchronization.
        final_sha = local_sha
    else:
        parents = [local_sha]
        if remote_available and remote_sha != local_sha:
            parents.append(remote_sha)
        commit_sha = _commit_tree(project, branch, local_sha, parents, blob,
                                  "chore(night): synchronize inbox append")
        _update_ref(project, branch, commit_sha, local_sha)
        final_sha = commit_sha

    _atomic_write(inbox_path, merged)
    _update_index(project, blob)
    if remote_available and final_sha != remote_sha:
        pushed_result = _git(project, ["push", REMOTE, branch])
        if pushed_result.returncode != 0:
            detail = pushed_result.stderr.decode("utf-8", "replace").strip()
            raise SyncError("inbox synchronization push 실패" + (f": {detail}" if detail else ""))
        pushed = True

    return {
        "status": "ok",
        "project": project,
        "branch": branch,
        "remote": REMOTE,
        "remote_available": remote_available,
        "remote_error": remote_error,
        "local_commit_sha": local_sha,
        "remote_commit_sha": remote_sha,
        "result_commit_sha": final_sha,
        "friend_input_present": friend_input,
        "remote_inbox_commits": remote_inbox_commits,
        "mechanically_unioned": unioned,
        "changed": True,
        "committed": commit_sha is not None,
        "fast_forwarded": fast_forwarded,
        "pushed": pushed,
        "dry_run": False,
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--project", required=True)
    parser.add_argument("--branch", default=None)
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()
    try:
        result = synchronize(args)
    except MergeConflict as exc:
        print(json.dumps({"status": "merge-conflict", "error": "merge-conflict",
                          "reason": str(exc)}, ensure_ascii=False, sort_keys=True))
        return 1
    except (OSError, SyncError, ValueError) as exc:
        print(json.dumps({"status": "error", "error": str(exc)},
                         ensure_ascii=False, sort_keys=True))
        return 1
    print(json.dumps(result, ensure_ascii=False, sort_keys=True))
    return 0


if __name__ == "__main__":
    sys.exit(main())
