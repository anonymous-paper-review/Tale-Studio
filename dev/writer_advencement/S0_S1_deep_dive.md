# S0 + S1 Deep Dive: Genre/Tone + Narrative Structure/POV

> Date: 2026-04-15
> Position in Dual-Axis: S-axis upper layers (highest change cost)
> S0 change = new project. S1 change = full story reconstruction.
> Companion docs: `dual_axis_model.md`, `linear_pipeline.md`

---

## PART 1: S0 -- Genre / Tone

S0 answers: **"What kind of story is this, and what does it feel like?"**

S0 is the single highest-cost decision on the S-axis. Changing genre/tone after S1+ invalidates everything downstream. It is the "contract" between creator and audience: a promise about what emotional experience to expect.

---

### 1. Genre Taxonomy

#### 1.1 The Nature of Genre

Genre is not a single label -- it is a multi-dimensional classification system. Following Eric R. Williams' taxonomy and synthesizing with standard film theory, genre operates at multiple levels:

```
Film Type (broadest)     Comedy, Drama, Documentary, Experimental
  Super Genre            Action, Horror, Sci-Fi, Fantasy, Romance, Thriller...
    Macro Genre          Psychological Thriller, Space Opera, Gothic Horror...
      Micro Genre        Slasher, Cozy Mystery, Solarpunk, K-Horror...
Voice (technique)        Musical, Animation, Mockumentary, Found Footage...
Pathway (cultural)       Bollywood, Wuxia, Spaghetti Western, K-Drama...
```

**The defining equation (film theory):**
```
Genre = Story/Action + Plot + Character + Setting
S(A) + P + C + Se = Genre
```

Each genre has a unique DNA composed of:
- **Iconography** -- recurring visual symbols (horror: darkness, isolated houses; western: desert, horses)
- **Conventions** -- expected story beats (mystery: crime-clues-red herrings-reveal)
- **Settings** -- typical environments (sci-fi: future; western: frontier)
- **Character archetypes** -- expected roles (horror: final girl; noir: femme fatale)
- **Narrative patterns** -- structural tendencies (romance: meet-obstacle-union)

#### 1.2 Primary Genres -- Complete Classification

##### ACTION

**Core DNA:** Physical conflict, high stakes, kinetic energy. The body in motion.
**Primary emotion:** Excitement, adrenaline
**Secondary emotion:** Relief, triumph
**Structural tendency:** Escalating set pieces, clear antagonist, physical climax

| Sub-genre | Defining trait | Example |
|-----------|---------------|---------|
| Martial Arts | Hand-to-hand combat choreography | Ip Man, The Raid |
| Gun-Fu | Stylized firearm choreography | John Wick, Hard Boiled |
| Heist/Caper | Planning + execution of elaborate theft | Ocean's Eleven, Heat |
| Disaster | Survival against natural/man-made catastrophe | The Day After Tomorrow |
| Survival | Protagonist vs hostile environment | The Revenant, 127 Hours |
| Spy/Espionage | Covert operations, deception | Mission: Impossible, Bourne |
| Swashbuckler | Adventurous swordplay, period setting | Pirates of the Caribbean |
| Vehicle/Chase | Cars, planes, boats as primary action | Mad Max: Fury Road, Speed |
| Military Action | Combat operations focus | Black Hawk Down |
| Superhero | Powered individuals vs extraordinary threats | The Dark Knight, Avengers |

##### HORROR

**Core DNA:** Confrontation with the unknown, violation of safety. Fear as primary experience.
**Primary emotion:** Fear, dread
**Secondary emotion:** Relief (survival), revulsion, unease
**Structural tendency:** Escalating threat, isolation, false safety moments, final confrontation

| Sub-genre | Defining trait | Example |
|-----------|---------------|---------|
| Slasher | Masked killer systematically eliminates group | Halloween, Scream |
| Psychological | Mind as battleground, reality questioned | The Shining, Black Swan |
| Cosmic/Lovecraftian | Incomprehensible entities, existential dread | Annihilation, Color Out of Space |
| Body Horror | Flesh transformation, bodily violation | The Fly, Tusk |
| Folk Horror | Rural settings, pagan/nature beliefs | Midsommar, The Wicker Man |
| Gothic Horror | Architecture as character, family secrets | Crimson Peak, Rebecca |
| Found Footage | Presented as discovered recordings | Blair Witch, Paranormal Activity |
| Survival Horror | Trapped with threat, resource scarcity | Alien, A Quiet Place |
| Zombie | Undead apocalypse, societal collapse | 28 Days Later, Train to Busan |
| Supernatural | Ghosts, demons, cursed objects | The Conjuring, Ringu |
| J-Horror | Japanese: slow dread, vengeful spirits, technology-as-curse | Ringu, Ju-On |
| K-Horror | Korean: social critique embedded in horror | A Tale of Two Sisters, The Wailing |
| Eco-Horror | Nature as antagonist | The Happening, Annihilation |
| Home Invasion | Domestic space violated | The Strangers, Funny Games |

##### COMEDY

**Core DNA:** Subverted expectations, incongruity, relief from tension. Laughter as primary experience.
**Primary emotion:** Amusement, joy
**Secondary emotion:** Surprise, recognition, warmth
**Structural tendency:** Setup-payoff rhythm, escalating absurdity, comic timing

| Sub-genre | Defining trait | Example |
|-----------|---------------|---------|
| Slapstick | Physical comedy, exaggerated action | The Three Stooges, Home Alone |
| Screwball | Fast-paced dialogue, battle of sexes | His Girl Friday, Bringing Up Baby |
| Satire | Social/political critique through humor | Dr. Strangelove, Don't Look Up |
| Parody/Spoof | Mimics specific genre conventions | Airplane!, Scary Movie |
| Dark Comedy | Humor from taboo/morbid subjects | Fargo, In Bruges |
| Romantic Comedy | Love story + comedic obstacles | When Harry Met Sally, Crazy Rich Asians |
| Buddy Comedy | Mismatched duo, chemistry-driven | Rush Hour, The Nice Guys |
| Absurdist | Logic-defying, surreal humor | Monty Python, The Lobster |
| Cringe/Awkward | Embarrassment as comedy engine | The Office, Borat |
| Fish-Out-of-Water | Character in unfamiliar environment | Elf, Coming to America |
| Stoner | Drug culture, laid-back shenanigans | Pineapple Express, Harold & Kumar |
| Mockumentary | Fictional documentary format | Best in Show, What We Do in the Shadows |

##### DRAMA

**Core DNA:** Emotional truth, character depth, the human condition explored seriously.
**Primary emotion:** Empathy, catharsis
**Secondary emotion:** Sadness, hope, anger, reflection
**Structural tendency:** Character-driven, internal conflict, thematic resolution

| Sub-genre | Defining trait | Example |
|-----------|---------------|---------|
| Legal | Courtroom, justice system | 12 Angry Men, A Few Good Men |
| Medical | Healthcare setting, life/death stakes | Patch Adams, The Doctor |
| Political | Power structures, governance | All the President's Men, Lincoln |
| Family | Domestic relationships, generational conflict | Ordinary People, Little Miss Sunshine |
| Coming-of-Age | Adolescent identity formation | Boyhood, Lady Bird |
| Historical | Based on real events/periods | Schindler's List, 12 Years a Slave |
| Biographical (Biopic) | Real person's life story | Bohemian Rhapsody, Oppenheimer |
| Sports | Athletic competition as life metaphor | Rocky, Chariots of Fire |
| Melodrama | Heightened emotion, moral polarization | Imitation of Life, Far from Heaven |
| Social Realism | Working class, systemic issues | Parasite, I, Daniel Blake |
| Tragedy | Protagonist's downfall through flaw | Requiem for a Dream, Atonement |
| Docudrama | Real events in dramatic recreation | United 93, The Big Short |

##### THRILLER

**Core DNA:** Sustained tension, audience anxiety, cat-and-mouse dynamics. The question "what happens next?" as engine.
**Primary emotion:** Suspense, anxiety
**Secondary emotion:** Shock, paranoia, relief
**Structural tendency:** Escalating stakes, ticking clock, twist revelations

| Sub-genre | Defining trait | Example |
|-----------|---------------|---------|
| Psychological | Mind games, unreliable reality | Gone Girl, Shutter Island |
| Political | Conspiracy, government intrigue | The Manchurian Candidate, Three Days of the Condor |
| Techno-Thriller | Technology-driven threat | The Net, Eagle Eye |
| Legal | Legal system as arena of tension | A Time to Kill, Primal Fear |
| Erotic | Sexuality intertwined with danger | Fatal Attraction, Basic Instinct |
| Conspiracy | Hidden powerful forces, paranoia | The Parallax View, Enemy of the State |
| Survival | Endurance against life-threatening situation | Gravity, The Shallows |
| Crime Thriller | Criminal enterprise with thriller pacing | Sicario, No Country for Old Men |
| Neo-Noir | Modern noir: cynicism, moral ambiguity, shadows | Drive, Nightcrawler |

##### SCIENCE FICTION

**Core DNA:** Speculative extrapolation from science/technology. "What if?" as engine.
**Primary emotion:** Wonder, unease
**Secondary emotion:** Awe, fear, intellectual curiosity
**Structural tendency:** World-building exposition, technology-driven conflict, philosophical resolution

| Sub-genre | Defining trait | Example |
|-----------|---------------|---------|
| Space Opera | Grand interstellar adventure | Star Wars, Dune |
| Cyberpunk | Near-future, tech dystopia, corporate power | Blade Runner, Ghost in the Shell |
| Hard SF | Scientifically rigorous speculation | The Martian, Interstellar |
| Post-Apocalyptic | After civilization collapses | The Road, Children of Men |
| Dystopia | Oppressive future society | 1984, The Hunger Games |
| Time Travel | Temporal manipulation | Looper, Primer |
| First Contact | Encountering alien intelligence | Arrival, Contact |
| AI/Robotics | Artificial intelligence questions | Ex Machina, Her |
| Biopunk | Genetic engineering, biological modification | Gattaca, Splice |
| Solarpunk | Optimistic sustainable future | (emerging -- limited film examples) |
| Kaiju | Giant monster attacks | Godzilla, Pacific Rim |
| Mecha | Piloted giant robots | Evangelion, Pacific Rim |

##### FANTASY

**Core DNA:** Impossible made real through internal rules. Magic/supernatural as accepted truth.
**Primary emotion:** Wonder, enchantment
**Secondary emotion:** Nostalgia, hope, awe
**Structural tendency:** Quest structure, prophecy/destiny, world-building heavy

| Sub-genre | Defining trait | Example |
|-----------|---------------|---------|
| High/Epic Fantasy | Secondary world, grand stakes | Lord of the Rings, Game of Thrones |
| Low Fantasy | Magic intrudes into real world | Pan's Labyrinth, Coraline |
| Urban Fantasy | Magic in contemporary city | Bright, The Mortal Instruments |
| Dark Fantasy | Grim tone, horror elements | The Witcher, Berserk |
| Fairy Tale | Archetypal characters, moral lessons | Into the Woods, Enchanted |
| Mythological | Based on real-world myths | Clash of the Titans, Moana |
| Sword and Sorcery | Individual warrior + magic | Conan the Barbarian |
| Wuxia | Chinese martial arts + spiritual cultivation | Crouching Tiger Hidden Dragon, Hero |
| Portal Fantasy | Travel between worlds | Narnia, Spirited Away |
| Magical Realism | Magic treated as mundane within reality | Like Water for Chocolate, The Shape of Water |

##### ROMANCE

**Core DNA:** Love as central conflict and resolution. The relationship IS the plot.
**Primary emotion:** Love, longing
**Secondary emotion:** Joy, heartbreak, hope
**Structural tendency:** Meet-obstacle-separation-reunion OR meet-obstacle-acceptance

| Sub-genre | Defining trait | Example |
|-----------|---------------|---------|
| Period/Historical | Past era setting, social constraints | Pride and Prejudice, Atonement |
| Contemporary | Modern setting, relatable situations | The Notebook, Crazy Rich Asians |
| Tragic | Love that cannot survive | Brokeback Mountain, Titanic |
| Forbidden | Love against social prohibition | Romeo + Juliet, Carol |
| Second Chance | Reconnecting after separation | Before Sunset, The Bridges of Madison County |
| Meet-Cute | Charming/unlikely first encounter | Notting Hill, Sleepless in Seattle |

##### MYSTERY

**Core DNA:** Information asymmetry as engine. Puzzle to be solved. The audience knows less than the truth.
**Primary emotion:** Curiosity, intellectual engagement
**Secondary emotion:** Surprise, satisfaction (at revelation)
**Structural tendency:** MUST have: crime/puzzle, investigation, red herrings, revelation

| Sub-genre | Defining trait | Example |
|-----------|---------------|---------|
| Whodunit | Identity of culprit unknown | Knives Out, Murder on the Orient Express |
| Locked Room | Impossible crime, confined space | And Then There Were None |
| Cozy Mystery | Low violence, charming setting | Miss Marple adaptations |
| Noir/Hardboiled | Cynical detective, moral gray zone | Chinatown, The Maltese Falcon |
| Police Procedural | Realistic investigative process | Zodiac, Seven |
| Amateur Sleuth | Non-professional investigator | Rear Window |
| Conspiracy Mystery | Large-scale hidden truth | The Da Vinci Code |

##### WESTERN

**Core DNA:** Frontier setting, civilization vs wilderness, individual vs society. Moral code in lawless land.
**Primary emotion:** Awe (landscape), tension
**Secondary emotion:** Nostalgia, melancholy, justice
**Structural tendency:** Showdown structure, arrival of stranger, community under threat

| Sub-genre | Defining trait | Example |
|-----------|---------------|---------|
| Classic/Traditional | Heroic gunslinger, clear morality | The Searchers, Shane |
| Revisionist | Questioning the mythology | Unforgiven, The Assassination of Jesse James |
| Spaghetti | Italian production, stylized violence | The Good, the Bad and the Ugly |
| Neo-Western | Modern setting, western themes | No Country for Old Men, Hell or High Water |
| Space Western | Frontier tropes in space | Firefly, The Mandalorian |
| Acid Western | Psychedelic, counter-culture | Dead Man, El Topo |

##### WAR

**Core DNA:** Armed conflict as crucible for human nature. Brotherhood, sacrifice, futility.
**Primary emotion:** Tension, horror
**Secondary emotion:** Grief, camaraderie, patriotism/anti-war
**Structural tendency:** Mission structure, escalating danger, loss/survival

| Sub-genre | Defining trait | Example |
|-----------|---------------|---------|
| Combat | Frontline battle focus | Saving Private Ryan, 1917 |
| Anti-War | War's futility and cost | Apocalypse Now, Come and See |
| POW/Escape | Captivity and resistance | The Great Escape, Bridge on the River Kwai |
| Home Front | War's impact on civilians | Mrs. Miniver, The Pianist |
| Espionage (wartime) | Intelligence operations | The Imitation Game, Inglourious Basterds |

##### CRIME

**Core DNA:** Criminal activity as lens on society, morality, power. Law and its violation.
**Primary emotion:** Fascination, tension
**Secondary emotion:** Moral conflict, dread
**Structural tendency:** Rise-and-fall, cat-and-mouse, moral compromise

| Sub-genre | Defining trait | Example |
|-----------|---------------|---------|
| Gangster | Organized crime, rise and fall | The Godfather, Goodfellas |
| Heist | Planning and executing a theft | Reservoir Dogs, The Italian Job |
| Prison | Incarceration, escape, justice | The Shawshank Redemption, Escape from Alcatraz |
| True Crime | Based on real criminal cases | Zodiac, Monster |
| Drug Trade | Narcotics underworld | Scarface, Traffic |
| White Collar | Financial/corporate crime | The Wolf of Wall Street, Enron |
| Noir | Cynical protagonist, moral corruption | Double Indemnity, L.A. Confidential |

##### DOCUMENTARY

**Core DNA:** Real-world truth-seeking. Reality as subject.
**Primary emotion:** Insight, awareness
**Secondary emotion:** Empathy, outrage, wonder
**Structural tendency:** Thesis-evidence-conclusion OR observational journey

| Sub-genre | Defining trait | Example |
|-----------|---------------|---------|
| Observational (Fly-on-wall) | No narration, pure observation | Frederick Wiseman's works |
| Participatory | Filmmaker involved in events | Super Size Me, Fahrenheit 9/11 |
| Expository | Voice-of-God narration | Planet Earth, March of the Penguins |
| Reflexive | Film questions its own methods | Stories We Tell |
| Poetic | Aesthetic-driven, impressionistic | Baraka, Koyaanisqatsi |
| Essay Film | Personal argument/meditation | Sans Soleil, F for Fake |
| True Crime Doc | Real criminal cases investigated | Making a Murderer, The Jinx |
| Nature | Wildlife and environment | Our Planet, Blue Planet |
| Music | Artists, scenes, performances | Amy, Searching for Sugar Man |

##### MUSICAL

**Core DNA:** Music and song as narrative device. Emotion expressed through performance.
**Primary emotion:** Joy, catharsis (through music)
**Secondary emotion:** Nostalgia, longing, energy
**Structural tendency:** Numbers advance plot/character, reality/fantasy boundary blurred

| Sub-genre | Defining trait | Example |
|-----------|---------------|---------|
| Backstage/Showbiz | Characters in entertainment industry | A Star Is Born, Chicago |
| Jukebox | Built around existing songs | Mamma Mia!, Across the Universe |
| Animated Musical | Disney/studio animation tradition | The Lion King, Frozen |
| Rock/Pop Musical | Contemporary music style | School of Rock, Pitch Perfect |
| Dance-Focused | Choreography central | West Side Story, Footloose |
| Opera/Classical | Classical music tradition | Amadeus, Phantom of the Opera |

##### ANIMATION (as Voice/Technique, not genre)

Animation is a MEDIUM, not a genre. "Animated comedy," "animated horror," and "animated drama" are all valid. However, certain traditions have genre-like conventions:

| Tradition | Convention pattern |
|-----------|-------------------|
| Disney/Pixar | Musical + coming-of-age + family + moral lesson |
| Anime (general) | Extreme genre flexibility -- horror, romance, mecha, slice-of-life all exist |
| Studio Ghibli | Fantasy + slice-of-life + ecological themes + melancholy |
| Adult Animation | Satire + dark comedy + social commentary (South Park, Bojack) |

#### 1.3 Hybrid Genres -- How They Work

Hybrid genres combine the DNA of two or more genres. Success depends on which elements are borrowed and how they integrate.

**Rules of Hybridization:**

1. **One genre dominates** -- there is always a "host" genre that provides primary structure
2. **The secondary genre provides flavor** -- tone, setting, or specific conventions
3. **Shared elements create natural bridges** -- genres with overlapping emotions hybridize more easily
4. **Conflicting conventions must be resolved** -- choose which genre's "rules" win when they clash

**Common successful hybrids:**

| Hybrid | Host genre | Flavor genre | Why it works |
|--------|-----------|-------------|--------------|
| Horror-Comedy | Horror | Comedy | Both rely on tension-release; laughter replaces scream | Shaun of the Dead |
| Sci-Fi Western | Western | Sci-Fi | Frontier mythology maps to space; isolation shared | Firefly |
| Romantic Thriller | Thriller | Romance | Both use emotional stakes; betrayal serves both | Gone Girl |
| Crime Comedy | Crime | Comedy | Incompetent criminals create humor naturally | Fargo |
| War Horror | War | Horror | Combat already provides fear; supernatural adds layer | Overlord |
| Fantasy Comedy | Fantasy | Comedy | Genre conventions are inherently absurd when examined | Princess Bride |
| Sci-Fi Horror | Horror | Sci-Fi | Unknown = fear; isolation in space | Alien |
| Musical Horror | Horror | Musical | Maximum tonal dissonance = maximum unease | Sweeney Todd |
| Action Comedy | Action | Comedy | Physical comedy has ancient roots; stunt = slapstick | Rush Hour |
| Documentary Horror (Mockumentary) | Horror | Documentary | Realism amplifies believability of threat | Lake Mungo |

**Difficult hybrids (require exceptional skill):**

| Hybrid | Difficulty source | Rare success |
|--------|------------------|-------------|
| Horror-Romance | Fear contradicts vulnerability needed for romance | Let the Right One In |
| Comedy-Tragedy | Laughing at suffering vs empathizing with it | Life Is Beautiful |
| Musical-Horror | Song requires openness; horror requires dread | Sweeney Todd |
| Documentary-Fantasy | Reality claim vs impossibility | Stories We Tell (stretching) |

---

### 2. Tone Spectrum

#### 2.1 What Tone IS (vs Genre)

**Genre** = WHAT story you tell (structural category)
**Tone** = HOW you tell it (attitude, emotional texture)

The same genre can have radically different tones:

```
Horror + Light tone      = Beetlejuice, Ghostbusters
Horror + Dark tone       = Hereditary, The Witch
Horror + Absurdist tone  = Tucker and Dale vs Evil
Horror + Earnest tone    = The Babadook
Horror + Satirical tone  = Get Out, Ready or Not
```

Tone is the filmmaker's ATTITUDE toward the subject matter, communicated through every creative decision: cinematography, music, editing, performance, dialogue, pacing.

#### 2.2 Complete Tone Taxonomy

Tones exist on multiple spectra, not a single axis:

**Spectrum 1: Lightness / Darkness**

| Tone | Description | Example |
|------|-------------|---------|
| **Lighthearted** | Breezy, fun, low stakes feel | Paddington, The Grand Budapest Hotel |
| **Warm** | Comforting, generous, kind | Studio Ghibli films, Amelie |
| **Neutral/Balanced** | Neither pushing light nor dark | Most mainstream dramas |
| **Somber** | Heavy, weighty, serious | Manchester by the Sea |
| **Dark** | Bleak, oppressive, disturbing | Se7en, Requiem for a Dream |
| **Pitch Black** | Nihilistic, unflinching, no hope | Come and See, Funny Games |

**Spectrum 2: Seriousness / Irreverence**

| Tone | Description | Example |
|------|-------------|---------|
| **Earnest** | Sincere, emotionally honest | The Shawshank Redemption, WALL-E |
| **Serious** | Grave, treating subject with weight | Schindler's List, 12 Years a Slave |
| **Wry** | Dry humor layered under seriousness | Coen Brothers films, Wes Anderson |
| **Playful** | Lightheartedly engaged, not mocking | Spider-Verse, Guardians of the Galaxy |
| **Satirical** | Critiquing through exaggeration | Dr. Strangelove, Don't Look Up |
| **Ironic** | Saying one thing, meaning another | American Psycho |
| **Absurdist** | Logic itself is the joke | Monty Python, The Lobster |
| **Cynical** | Distrustful, world-weary | Chinatown, Nightcrawler |

**Spectrum 3: Emotional Temperature**

| Tone | Description | Example |
|------|-------------|---------|
| **Hopeful/Optimistic** | Belief in positive outcome | It's a Wonderful Life, WALL-E |
| **Melancholic** | Beautiful sadness, bittersweet | Lost in Translation, Her |
| **Nostalgic** | Longing for the past | Stand by Me, Cinema Paradiso |
| **Anxious/Tense** | Sustained unease | Uncut Gems, Whiplash |
| **Cathartic** | Building toward emotional release | Inside Out, Good Will Hunting |
| **Euphoric** | Overwhelming positive emotion | Amelie's climax, La La Land's dance scenes |
| **Desolate** | Emotional void, emptiness | The Road, Under the Skin |

**Spectrum 4: Stylistic Register**

| Tone | Description | Example |
|------|-------------|---------|
| **Naturalistic** | True to life, unembellished | The Florida Project, Moonlight |
| **Heightened** | Slightly larger than life | Wes Anderson, Edgar Wright |
| **Operatic** | Grand, emotionally maximal | Sergio Leone, Baz Luhrmann |
| **Surreal** | Dream-logic, uncanny | David Lynch, Yorgos Lanthimos |
| **Poetic** | Lyrical, emphasis on beauty/rhythm | Terrence Malick, Wong Kar-wai |
| **Gritty** | Rough, textured, street-level | City of God, Trainspotting |
| **Whimsical** | Charmingly fantastical, quirky | Amelie, The Secret Life of Walter Mitty |
| **Clinical** | Detached, observational | Kubrick, Michael Haneke |
| **Dreamlike** | Floaty, non-literal logic | Mulholland Drive, Eternal Sunshine |
| **Frenetic** | High-energy, barely contained | Edgar Wright, early Guy Ritchie |

#### 2.3 Tone Consistency Rules

**When can tone shift?**

1. **Planned tonal contrast** -- Deliberate shift for impact
   - Example: Up's opening 10 minutes (euphoric love story -> devastating loss)
   - Rule: The shift must serve the story's emotional argument

2. **Genre-mandated shifts** -- Some genres require tonal variation
   - Horror: tension-relief cycles (false scares before real ones)
   - Comedy-drama (dramedy): alternating serious and funny beats
   - Rule: The shift pattern should be RHYTHMIC, not random

3. **Act-based shifts** -- Tone darkening/lightening across acts
   - Common: lighthearted Act 1 -> darker Act 2 -> cathartic Act 3
   - Rule: The trajectory should feel EARNED, not jarring

**When does tonal shift BREAK?**

1. **Unearned comedy in serious moments** -- laughing at pain the story asks us to take seriously
2. **Sudden darkness without setup** -- cheerful film suddenly becomes traumatic
3. **Inconsistent within scene** -- mixed signals in a single sequence confuse emotional reading
4. **Tonal mismatch with subject gravity** -- trivializing serious subjects without satirical intent

**The tonal contract hierarchy:**
```
Consistent tone throughout        = SAFEST
Planned shifts at act boundaries   = EFFECTIVE when earned
Tonal oscillation (dramedy)       = WORKS with clear rhythm
Sudden unearned shift             = BREAKS verisimilitude
```

---

### 3. Target Emotion Mapping

#### 3.1 Genre-to-Emotion Primary Mapping

Every genre makes an emotional PROMISE. This is the "contract."

| Genre | Primary emotion | Secondary emotions | The promise |
|-------|----------------|-------------------|-------------|
| **Horror** | Fear, dread | Relief, disgust, unease | "You will be afraid" |
| **Comedy** | Amusement, joy | Surprise, recognition, warmth | "You will laugh" |
| **Drama** | Empathy, catharsis | Sadness, hope, anger | "You will feel deeply" |
| **Action** | Excitement, thrill | Triumph, relief | "You will be thrilled" |
| **Thriller** | Suspense, anxiety | Paranoia, shock | "You will be on edge" |
| **Romance** | Love, longing | Joy, heartbreak, hope | "You will feel love" |
| **Mystery** | Curiosity | Surprise, satisfaction | "You will want to know" |
| **Sci-Fi** | Wonder, unease | Awe, intellectual stimulation | "You will wonder 'what if'" |
| **Fantasy** | Enchantment, wonder | Hope, nostalgia | "You will believe the impossible" |
| **War** | Tension, horror | Grief, camaraderie | "You will feel the cost" |
| **Crime** | Fascination | Moral conflict, dread | "You will be drawn to darkness" |
| **Western** | Awe, tension | Nostalgia, justice | "You will feel the frontier" |
| **Documentary** | Insight | Empathy, outrage, wonder | "You will understand" |
| **Musical** | Joy, catharsis | Energy, nostalgia | "You will feel through music" |

#### 3.2 Emotional Trajectory Patterns

Each genre has a characteristic emotional SHAPE:

```
Horror:       ___/\/\___/\/\/\____/\/\/\/\/\____/\  (escalating tension-release)
Comedy:       /\/\/\/\/\/\/\/\/\/\/\/\/\/\/\/\/\     (rhythmic peaks)
Drama:        ____/‾‾‾‾‾‾\____/‾‾‾‾‾‾‾‾‾‾‾‾\___    (slow build, sustained, release)
Thriller:     ___/‾‾‾‾‾‾‾‾/‾‾‾‾‾‾‾‾‾‾/‾‾‾‾‾‾‾\    (escalating baseline)
Action:       /\__/\___/\/\___/\/\/\___/\/\/\/\___   (set piece peaks)
Romance:      ___/‾‾‾\_____/‾‾‾‾‾‾‾\_/‾‾‾‾‾‾‾‾\   (connection-separation-reunion)
Mystery:      ____/___/___/___/___/‾‾‾‾‾‾‾‾‾‾\/    (accumulating revelation)
```

---

### 4. Genre Conventions and Expectations

#### 4.1 Convention Types

Every genre has three types of conventions:

| Type | Description | Audience reaction when violated |
|------|-------------|-------------------------------|
| **Obligatory** | MUST be present or genre fails | Confusion, betrayal ("this isn't a mystery without a reveal") |
| **Expected** | Usually present, noticed when absent | Mild surprise ("no jump scares in this horror?") |
| **Optional** | Present in some entries, not all | Neutral or pleasant surprise |

#### 4.2 Genre-Specific Convention Tables

**Horror conventions:**

| Convention | Type | Breaking effect |
|-----------|------|-----------------|
| Something threatens protagonists | Obligatory | Not horror anymore |
| Building dread/atmosphere | Obligatory | Becomes thriller or action |
| Jump scares | Expected | Slow-burn horror is valid (Hereditary) |
| Final girl / survivor | Expected | Can subvert (Cabin in the Woods) |
| Dark/isolated setting | Expected | Daylight horror works as subversion (Midsommar) |
| Monster/killer reveal | Optional | Ambiguity can be scarier (Blair Witch) |
| Everyone dies | Optional | Happy endings are rare but valid |

**Mystery conventions:**

| Convention | Type | Breaking effect |
|-----------|------|-----------------|
| Puzzle/crime to solve | Obligatory | Not mystery anymore |
| Clues available to audience | Obligatory | Unfair mystery frustrates |
| Red herrings | Expected | Without them, too easy |
| Detective/investigator figure | Expected | Can be absent (audience is detective) |
| Revelation/solution | Obligatory | Without resolution, audience feels cheated |
| "Fair play" (solvable) | Expected | Unsolvable mystery angers engaged viewers |

**Romance conventions:**

| Convention | Type | Breaking effect |
|-----------|------|-----------------|
| Two people attracted to each other | Obligatory | Not romance |
| Obstacle to union | Obligatory | No tension = no story |
| Emotional vulnerability shown | Obligatory | Characters feel hollow |
| Happy ending / HEA/HFN | Expected | Tragic romance is valid but controversial |
| Grand gesture / declaration | Expected | Understated works too (Lost in Translation) |
| Meet-cute | Optional | Established relationship is valid |

**Comedy conventions:**

| Convention | Type | Breaking effect |
|-----------|------|-----------------|
| Makes audience laugh | Obligatory | Not comedy |
| Incongruity/subversion | Obligatory | Without surprise, no humor |
| Happy or absurd resolution | Expected | Dark comedy can end darkly |
| Comic timing (pacing) | Obligatory | Poor timing kills comedy |
| Escalation | Expected | Flat rhythm bores |

#### 4.3 Cultural Variations in Genre Conventions

Genre conventions are NOT universal. They vary significantly by culture:

| Genre | Western convention | East Asian variation | Bollywood variation |
|-------|-------------------|---------------------|---------------------|
| **Horror** | Isolation, jumpscares, monster reveal | J-Horror: slow dread, technology curse, no resolution. K-Horror: social critique embedded | Musical numbers possible, family/supernatural overlap, moral lessons |
| **Romance** | Individual choice, HEA, kiss climax | K-Drama: slow burn, separation trope, societal pressure, side characters elaborate | Musical integration mandatory, family approval arc, wedding climax, melodrama accepted |
| **Comedy** | Situation-based, one-liner, physical | Japanese: absurdist escalation, manga-inspired, cultural in-jokes | Slapstick integrated with drama/romance/action in same film, musical breaks |
| **Action** | Gun choreography, explosions, one-liner quips | Wuxia: wire-fu, spiritual cultivation, honor codes. Korean: brutal realism | Song+dance fight sequences, hero worship, impossible physics accepted |
| **Thriller** | Twist ending, psychological focus, ticking clock | Korean: slow-burn, ensemble cast, societal rot, ambiguous morality | Melodramatic reveals, family stakes central |

**Key insight for the pipeline:**
```
Genre conventions are culturally dependent.
The same "genre label" means DIFFERENT things to different audiences.
→ Pipeline should encode PATHWAY (cultural tradition) alongside GENRE.
→ S0 should capture: Genre + Tone + Cultural Pathway
```

#### 4.4 Subversion vs Confusion

Genre subversion works when:
1. **Audience recognizes what's being subverted** -- must establish conventions before breaking them
2. **Breaking serves the story's argument** -- not random, but thematic
3. **Emotional contract is honored at a deeper level** -- Scream subverts slasher but still delivers fear
4. **Enough convention remains for orientation** -- total subversion = new genre, not subversion

Genre subversion fails when:
1. **Audience doesn't know the conventions being subverted** -- jokes without setup
2. **Breaking feels arbitrary** -- no thematic justification
3. **Core emotional promise is violated** -- horror that's not scary, comedy that's not funny
4. **Too many conventions broken simultaneously** -- audience loses all bearings

**Case studies of successful subversion:**

| Film | Genre | What's subverted | Why it works |
|------|-------|-----------------|-------------|
| **Get Out** | Horror | Villain isn't monster but liberal racism | Horror of social reality is scarier; contract (fear) fully honored |
| **Cabin in the Woods** | Horror | Meta-commentary on genre itself | Deconstructs while reconstructing; delivers scares AND laughs |
| **Scream** | Slasher | Characters know horror rules | Self-awareness makes old conventions fresh; still kills characters |
| **The Princess Bride** | Fantasy | Narrator interrupts, genre awareness | Love letter to genre while poking fun; sincerity underneath |
| **Deadpool** | Superhero | Fourth wall, R-rated, anti-heroism | Exhaustion with formula; different tone, same structure |
| **La La Land** | Musical Romance | Doesn't end in union | Honors romance (love was real) while choosing realism |
| **Midsommar** | Horror | Bright daylight, communal setting | Removes darkness, keeps dread; dissonance IS the horror |
| **Parasite** | Thriller | Genre itself shifts mid-film | From dark comedy to thriller to horror to tragedy; tonal mastery |

---

## PART 2: S1 -- Narrative Structure / POV / Theme

S1 answers: **"How is this story organized, who tells it, and what is it really about?"**

S1 is the second-highest-cost decision. Changing structure after S2+ means rebuilding all scenes and character arcs.

---

### 1. Structure Types

#### 1.1 Three-Act Structure (Western Default)

The most common structure in Hollywood cinema. Derived from Aristotle's Poetics (beginning, middle, end).

```
ACT 1 (Setup)              ACT 2 (Confrontation)              ACT 3 (Resolution)
~25% of runtime            ~50% of runtime                     ~25% of runtime

┌─────────────────┐  ┌──────────────────────────────────┐  ┌──────────────────┐
│ Ordinary World   │  │ Rising Complications               │  │ Climax            │
│ Character intro  │  │ Tests, Allies, Enemies             │  │ Final Battle      │
│ Status quo       │  │ ┌──────────┐                       │  │ Resolution        │
│                  │  │ │ Midpoint │ (reversal/revelation)  │  │ New equilibrium   │
│ INCITING        │──│─│──────────│──────────────────────│──│──│                  │
│ INCIDENT        │  │ │          │                       │  │ │                  │
│ (catalyst)      │  │ └──────────┘                       │  │                  │
│                  │  │              ┌────────────────────│──│──│                  │
│                  │  │              │ ALL IS LOST moment  │  │                  │
│                  │  │              │ (crisis)            │  │                  │
└─────────────────┘  └──────────────────────────────────┘  └──────────────────┘
     Plot Point 1                Plot Point 2
   (end of Act 1)              (end of Act 2)
```

**Key turning points:**
- **Inciting Incident** (10-15%): Event that disrupts the ordinary world
- **Plot Point 1** (25%): Protagonist commits to the journey
- **Midpoint** (50%): Major revelation or reversal that raises stakes
- **All Is Lost** (75%): Lowest point, seems impossible
- **Plot Point 2** (75-80%): Discovery that enables the climax
- **Climax** (85-95%): Final confrontation
- **Resolution** (95-100%): New equilibrium

**Best for:** Action, thriller, mainstream drama, romance, adventure
**Limitations:** Can feel formulaic. The "sagging middle" problem (Act 2 is 50% of film). Conflict-centric -- not all stories need rising conflict.
**Failure mode:** Slavish adherence to page-count rules creates mechanical, predictable storytelling.

#### 1.2 Ki-Seung-Jeon-Gyeol (East Asian 4-Part Structure)

```
기 (Ki/Introduction)  →  승 (Seung/Development)  →  전 (Jeon/Turn)  →  결 (Gyeol/Conclusion)
     ~25%                      ~25%                    ~25%                  ~25%
```

| Part | Name | Function | Key difference from 3-Act |
|------|------|----------|--------------------------|
| **Ki** | Introduction | Establish world, characters, situation | Similar to Act 1 but self-contained |
| **Seung** | Development | Deepen and elaborate, NO new conflict yet | NOT rising action -- EXPANSION |
| **Jeon** | Turn/Twist | Unexpected change of direction | Not a midpoint -- a TWIST that recontextualizes |
| **Gyeol** | Conclusion | Resolution AND reflection | Includes emotional aftermath missing in 3-Act |

**Critical difference:** Ki-Seung-Jeon-Gyeol does NOT require escalating conflict. The "turn" (Jeon) is about surprise/recontextualization, not necessarily raising stakes. The conclusion (Gyeol) emphasizes contemplation and emotional resonance rather than just resolution.

**Best for:** Character studies, slice-of-life, contemplative stories, East Asian narratives, stories about acceptance rather than conquest
**Limitations:** Can feel slow to Western audiences. The "turn" must genuinely surprise.
**Failure mode:** Weak Jeon (turn) makes the story feel like it goes nowhere.

**Important note for pipeline:**
The current L1 Scene Architect already uses this structure ("4 scenes following Ki-Seung-Jeon-Gyeol"). S1 should support BOTH this and alternative structures.

#### 1.3 Kishotenketsu (Japanese/Chinese/Korean -- Conflict-Free 4-Act)

Often confused with Ki-Seung-Jeon-Gyeol but has a distinct philosophical difference.

```
Ki (Introduction)  →  Sho (Development)  →  Ten (Twist)  →  Ketsu (Conclusion)
```

**The fundamental innovation:** Kishotenketsu does not require conflict. Instead, it uses **juxtaposition** as its engine.

```
Example (4-panel manga):
Panel 1 (Ki):   "A girl walks to school."
Panel 2 (Sho):  "She sees cherry blossoms falling."
Panel 3 (Ten):  "A petal lands on a grave she hadn't noticed."
Panel 4 (Ketsu): "She places her backpack down and sits."

No conflict. No antagonist. No rising action.
Engine: juxtaposition of life (school) and death (grave).
The twist RECONTEXTUALIZES panels 1-2.
```

**Best for:** Contemplative stories, Studio Ghibli-style narratives, poems, advertising, moments of realization
**Limitations:** Does not sustain long narratives easily without modification. Western audiences may feel "nothing happened."
**Failure mode:** The twist (Ten) feels random rather than illuminating.

#### 1.4 Hero's Journey / Monomyth (Campbell/Vogler)

Joseph Campbell's 17-stage model, condensed to 12 by Christopher Vogler for screenwriting:

```
           ┌── SPECIAL WORLD ──────────────────────────────────┐
           │                                                    │
ORDINARY   │  3. Tests,     5. Ordeal    7. Road      9. Return │   ORDINARY
 WORLD ────│  4. Allies,    6. Reward    8. Back      with      │── WORLD
           │     Enemies                              Elixir    │   (transformed)
    1. Call│                                                    │
    2. Cross│                                                    │
      Threshold                                                  │
           └────────────────────────────────────────────────────┘
```

**Vogler's 12 stages:**

| # | Stage | Function | Screenplay page (approx) |
|---|-------|----------|-------------------------|
| 1 | **Ordinary World** | Establish hero's normal life | 1-10 |
| 2 | **Call to Adventure** | Disruption / invitation | 10-15 |
| 3 | **Refusal of the Call** | Hero's hesitation, stakes revealed | 15-25 |
| 4 | **Meeting the Mentor** | Guide appears, tools given | 25-30 |
| 5 | **Crossing the Threshold** | Commitment, entering special world | 25-30 |
| 6 | **Tests, Allies, Enemies** | Learning the rules of new world | 30-60 |
| 7 | **Approach to the Inmost Cave** | Preparation for central ordeal | 55-65 |
| 8 | **The Ordeal** | Death & rebirth, facing greatest fear | 60-75 |
| 9 | **Reward (Seizing the Sword)** | Hero gains prize/knowledge | 75-80 |
| 10 | **The Road Back** | Consequences, chase, ticking clock | 80-90 |
| 11 | **Resurrection** | Final test, applying lessons | 90-100 |
| 12 | **Return with the Elixir** | Hero brings gift back to ordinary world | 100-110 |

**Best for:** Fantasy, adventure, coming-of-age, superhero, epic stories. ANY story about transformation.
**Limitations:** Not all stories are about a single hero leaving home. Can feel formulaic when applied mechanically. Culturally biased (Western individualism).
**Failure mode:** Checking boxes rather than finding organic story beats.

#### 1.5 Save the Cat (Blake Snyder's 15 Beats)

A refinement of 3-Act Structure specifically for screenwriting, with precise page-count targets.

| # | Beat | Page (of 110) | Function |
|---|------|--------------|----------|
| 1 | **Opening Image** | 1 | Visual thesis statement, "before" snapshot |
| 2 | **Theme Stated** | 5 | Someone states the theme (hero doesn't get it yet) |
| 3 | **Set-Up** | 1-10 | Ordinary world, introduce characters, plant seeds |
| 4 | **Catalyst** | 12 | Inciting incident -- life changes |
| 5 | **Debate** | 12-25 | Hero hesitates -- should I do this? |
| 6 | **Break into Two** | 25 | Hero enters Act 2 (upside-down world) |
| 7 | **B Story** | 30 | New character (often love interest) = thematic sounding board |
| 8 | **Fun and Games** | 30-55 | The "promise of the premise" -- what the trailer shows |
| 9 | **Midpoint** | 55 | False victory or false defeat |
| 10 | **Bad Guys Close In** | 55-75 | External pressure + internal doubt intensify |
| 11 | **All Is Lost** | 75 | Lowest point. "Whiff of death" |
| 12 | **Dark Night of the Soul** | 75-85 | Hero at bottom. Reflects on everything |
| 13 | **Break into Three** | 85 | A-story and B-story merge. Hero has epiphany |
| 14 | **Finale** | 85-110 | Hero applies lessons, defeats antagonist, transforms |
| 15 | **Final Image** | 110 | "After" snapshot. Mirror of opening image |

**Best for:** Commercial screenwriting, any genre (Snyder mapped all genres to this structure)
**Limitations:** Very prescriptive about page counts. Optimized for 110-page feature scripts.
**Failure mode:** Mechanical application produces "beat sheet movies" that feel manufactured.

#### 1.6 Five-Act Structure (Freytag's Pyramid)

Codified by Gustav Freytag from Shakespearean drama:

```
                        ACT 3: CLIMAX
                           /\
                          /  \
               ACT 2:    /    \    ACT 4:
            RISING      /      \   FALLING
            ACTION     /        \  ACTION
                      /          \
           ACT 1:    /            \    ACT 5:
         EXPOSITION /              \  DENOUEMENT
         __________/                \___________
```

| Act | Name | Function |
|-----|------|----------|
| 1 | **Exposition** | Setting, characters, inciting incident (exciting force) |
| 2 | **Rising Action** | Complications escalate, conflicts develop |
| 3 | **Climax** | Peak tension, turning point, crisis moment |
| 4 | **Falling Action** | Consequences unfold, resolution approaches |
| 5 | **Denouement** | Resolution, catastrophe (tragedy) or celebration (comedy) |

**Key difference from 3-Act:** The climax is in the MIDDLE (Act 3), not near the end. Acts 4-5 deal extensively with consequences.

**Best for:** Tragedy, complex drama, Shakespeare adaptations, prestige television
**Limitations:** Falling action can feel anticlimactic after the climax. Modern audiences expect late climax.
**Failure mode:** Act 4-5 feel like unnecessary epilogue.

#### 1.7 Non-Linear / Fragmented

Not a structure per se, but a family of techniques for presenting story out of chronological order.

| Type | Mechanism | Example |
|------|-----------|---------|
| **Reverse chronological** | Story told backwards | Memento, Irreversible |
| **Mosaic/Hyperlink** | Multiple timelines intersecting | Pulp Fiction, Babel |
| **Puzzle/Mystery box** | Audience must assemble the timeline | Arrival, Mulholland Drive |
| **Flashback-heavy** | Present frame + past sequences | The Godfather Part II, Forrest Gump |
| **Parallel timelines** | Two+ timelines shown simultaneously | Cloud Atlas, Dunkirk |
| **Anthology** | Loosely connected stories | Paris je t'aime, Wild Tales |

**When non-linear works:**
1. The non-linear order reveals information in a more dramatically effective sequence than chronological
2. The structure itself mirrors the story's theme (Memento's reverse = memory loss)
3. Juxtaposition between timelines creates meaning (Dunkirk: land/sea/air timescales)

**When non-linear fails:**
1. Used for "cleverness" rather than thematic purpose
2. Audience confusion exceeds audience engagement
3. Chronological order would have been MORE dramatic (the "gimmick" problem)

**Best for:** Mystery, psychological thriller, memory/identity stories, stories exploring causality
**Limitations:** High cognitive demand on audience. Can feel pretentious if not justified.
**Failure mode:** Confusion mistaken for complexity.

#### 1.8 Circular / Ouroboros

The story returns to its starting point, but the character (and audience) understand it differently.

```
START ──────────────────────────────────────── END
  A                                              A'
  │                                              │
  │   (character transforms through journey)     │
  │                                              │
  └── same location/situation ── same visual ────┘
       but DIFFERENT meaning
```

**Key principle:** The return is not repetition -- it is transformed repetition. The same image/situation at the end MEANS something different because of what happened.

**Examples:**
- **Groundhog Day**: Same day, different person
- **Gone Girl**: Same couple, different power dynamic
- **The Shawshank Redemption**: Opens and closes with Morgan Freeman narrating
- **Nolan films**: Frequently circular (Inception, Interstellar, Memento)

**Best for:** Stories about transformation, cycles, fate, existential themes
**Limitations:** Ending must recontextualize the beginning, or it feels like nothing changed.
**Failure mode:** True circularity (no change) = nihilism, which may not be intended.

#### 1.9 Frame Narrative (Story Within a Story)

```
OUTER FRAME: Someone tells/reads/watches the story
    │
    └──> INNER STORY: The actual narrative
              │
              └──> (optionally nested further)
```

**Examples:** The Princess Bride (grandfather reads to grandson), Titanic (old Rose tells story), 1001 Nights (Scheherazade frame)

**Functions of the frame:**
1. **Distance** -- creates emotional buffer for intense stories
2. **Unreliability** -- who is the frame narrator? Can we trust them?
3. **Commentary** -- frame can comment on the inner story
4. **Audience surrogate** -- frame listener = audience

**Best for:** Stories that benefit from perspective/distance, fairy tales, adaptation of oral traditions
**Limitations:** Frame can feel like interruption. Must justify its existence.
**Failure mode:** Frame is forgotten mid-story (audience stops caring about outer layer).

#### 1.10 Rashomon Structure (Multiple POV Same Event)

Named after Kurosawa's 1950 film. The same event told from multiple contradictory perspectives.

```
Event X happened.

Version A (Witness 1): X happened because...
Version B (Witness 2): No, X happened because...
Version C (Witness 3): Actually, X happened because...
Version D (Witness 4): None of you are right...

Truth: [ambiguous / composite / unknowable]
```

**Core principle:** Truth is subjective. Each narrator's version reveals more about THEM than about the event.

**When it works:** Stories about truth, perspective, memory, justice, deception
**Film examples:** Rashomon, Gone Girl, The Usual Suspects, Hail Caesar
**Failure mode:** All versions are boring, or one is obviously "correct" (defeats the purpose).

#### 1.11 Episodic / Vignette

Loosely connected sequences without a single escalating throughline.

```
Vignette 1 ── Vignette 2 ── Vignette 3 ── Vignette 4
     │              │              │              │
     └── connected by theme, location, character, or time period ──┘
         (NOT by escalating plot)
```

**Examples:** Slacker, Coffee and Cigarettes, Wild Tales, Paris je t'aime

**Best for:** Exploration of theme/place/concept, anthology, mood pieces
**Limitations:** No building momentum. Audience may disengage without throughline.
**Failure mode:** Episodes have no connective tissue -- feels like unrelated shorts.

#### 1.12 In Medias Res (Starting in the Middle)

Not a complete structure but a TECHNIQUE applied to other structures. Story begins at a dramatic moment, then fills in context.

```
CHRONOLOGICAL:  A → B → C → D → E
IN MEDIAS RES:  D → A → B → C → D' → E
                │
                Audience sees exciting moment first,
                then learns how we got there
```

**Examples:** Breaking Bad pilot (flash-forward), The Dark Knight opening, Sunset Blvd. (narrated by dead man)
**Best for:** Hooking audience immediately, stories with slow setup
**Failure mode:** Flash-forward spoils tension rather than creating it.

---

### 2. POV Types

#### 2.1 Complete POV Classification for Film

POV in film operates differently than in literature because the CAMERA is the narrator.

| POV Type | Camera behavior | Audience knowledge | Information control |
|----------|----------------|-------------------|-------------------|
| **First Person (Subjective)** | Camera IS the character's eyes | Only what character sees/knows | Maximum restriction |
| **Third Person Limited** | Camera follows ONE character | What that character experiences | High restriction |
| **Third Person Omniscient** | Camera moves freely between characters | More than any single character | Low restriction |
| **Shifting Limited** | Camera switches between characters (per scene/chapter) | Multiple limited perspectives | Medium restriction |
| **Unreliable Narrator** | Camera shows narrator's SUBJECTIVE version | What narrator claims happened (may be false) | Deliberately misleading |
| **Second Person** | Camera addresses audience directly | Audience IS the character | Extremely rare in film |
| **God's Eye / Objective** | Camera observes without access to inner life | Only external actions | Detached observation |

#### 2.2 Detailed POV Analysis

##### First Person (Subjective)

**Camera mapping:** POV shots dominate. Limited to what character physically sees.
**Strengths:**
- Maximum audience identification with protagonist
- Creates claustrophobia, immersion
- Perfect for horror (what's behind us?), mystery (limited information = suspense)

**Weaknesses:**
- Cannot show protagonist's face (losing emotional connection)
- Visually monotonous
- Protagonist must be present in every scene

**Film examples:**
- Hardcore Henry (full-film first person)
- Diving Bell and the Butterfly (locked-in syndrome POV)
- Enter the Void (POV of dying/dead protagonist)
- Lady in the Lake (1947, early experiment)

**S1xL3 impact:** First person POV -> heavy POV shot usage, limited camera movement options, shaky/handheld feel, restricted framing

##### Third Person Limited

**Camera mapping:** Camera follows one character closely but from outside. We see them, and we're restricted to their scenes and knowledge.
**Strengths:**
- Most versatile and common approach
- Allows audience to see character's face AND stay with their experience
- Creates suspense when character doesn't know what we don't know

**Weaknesses:**
- Cannot cut away to scenes without the focal character (or must justify it)
- Audience may feel frustrated by limited information

**Film examples:**
- Most mainstream films (The Bourne Identity, Gravity, Joker)
- Hitchcock's Rear Window (strictly limited to Jeff's apartment perspective)

**S1xL3 impact:** Close-up and OTS shots dominate, camera physically near character, limited establishing shots of events character isn't present for

##### Third Person Omniscient

**Camera mapping:** Camera can be anywhere, show any character's experience, cut freely between storylines.
**Strengths:**
- Maximum narrative flexibility
- Can create dramatic irony (audience knows what character doesn't)
- Handles ensemble casts naturally

**Weaknesses:**
- Less intimate, harder to identify with single character
- Can dilute tension by showing too much
- "God's eye" can feel detached

**Film examples:**
- The Lord of the Rings (multiple storylines shown freely)
- The Godfather (sees Michael, Sonny, Tom's experiences independently)
- Game of Thrones

**S1xL3 impact:** Wide variety of shot types, extensive establishing shots, free camera placement, parallel editing between storylines

##### Shifting POV

**Camera mapping:** Limited to one character per scene/sequence, but shifts between characters across the film.
**Strengths:**
- Combines intimacy of limited with breadth of omniscient
- Each shift reveals new information, creates dramatic irony
- Perfect for relationship stories (he said / she said)

**Weaknesses:**
- Audience must re-orient at each shift
- Unequal time with characters creates hierarchy problems

**Film examples:**
- Gone Girl (alternating Nick and Amy)
- Rashomon (each witness gets their sequence)
- He Said She Said structure in romantic comedies

**S1xL3 impact:** Visual style can shift per POV character (e.g., different color grading), camera behavior changes per character

##### Unreliable Narrator

**Camera mapping:** Camera shows what the narrator CLAIMS happened -- which may be false. Visual clues can signal unreliability.
**Strengths:**
- Creates powerful twist potential
- Audience participation (detecting lies)
- Explores truth, memory, perception themes

**Types of unreliability:**

| Type | Mechanism | Example |
|------|-----------|---------|
| **The Liar** | Deliberately deceives | The Usual Suspects (Verbal Kint) |
| **The Naif** | Innocent/limited understanding | Life Is Beautiful (child's perspective) |
| **The Madman** | Perceives reality differently | Fight Club, A Beautiful Mind |
| **The Biased** | Selective truth, subjective framing | Gone Girl (Amy's diary) |
| **The Amnesiac** | Genuinely cannot remember | Memento |

**S1xL3 impact:** Camera may use distorted visuals, continuity "errors" as clues, stark style shifts between "truth" and "lie" sections, careful blocking of reveals

##### Second Person

**Camera mapping:** Camera directly addresses viewer. Extremely rare in film.
**Film examples:** Ferris Bueller (breaking fourth wall), some interactive media
**Typically used as technique, not full-film POV.**

#### 2.3 POV and Suspense: Hitchcock's Framework

Alfred Hitchcock articulated the fundamental relationship between POV and dramatic effect:

```
SURPRISE: Audience doesn't know. Character doesn't know.
  → Bomb goes off. "Oh!" (5 seconds of shock)

SUSPENSE: Audience knows. Character doesn't know.
  → Audience sees the bomb. Character doesn't.
  → 5 MINUTES of tension as we watch character approach.

MYSTERY: Audience doesn't know. Character does (or nobody does).
  → Whodunit. We're trying to figure it out.
```

**POV determines which of these is possible:**

| POV | Surprise possible? | Suspense possible? | Mystery possible? |
|-----|-------------------|-------------------|------------------|
| First Person | Yes (limited info) | No (we know what char knows) | Yes (we're searching too) |
| Third Limited | Yes | Limited (only if char misses clue) | Yes |
| Third Omniscient | No (we see everything) | Yes (we know more than chars) | No (we know the answer) |
| Shifting | Yes (per POV) | Yes (between POVs) | Yes (assemble from parts) |
| Unreliable | Yes (revelation) | Yes (we suspect lies) | Yes (what's real?) |

---

### 3. Thematic Framework

#### 3.1 Universal Themes

Themes are the MEANING layer -- what the story is "really about" beneath the plot.

| Theme cluster | Variations | Example films |
|--------------|-----------|---------------|
| **Love** | Romantic, familial, platonic, self-love, unrequited, obsessive | Eternal Sunshine, Coco, Her |
| **Death / Mortality** | Fear of death, acceptance, grief, legacy, sacrifice | Coco, The Seventh Seal, Up |
| **Freedom** | Physical liberation, spiritual freedom, oppression, rebellion | Shawshank, Braveheart, 1984 |
| **Identity** | Self-discovery, masks, authenticity, nature vs nurture | Black Swan, Moonlight, Fight Club |
| **Power** | Corruption, responsibility, ambition, powerlessness | The Godfather, There Will Be Blood |
| **Justice** | Revenge vs forgiveness, law vs morality, fairness | 12 Angry Men, Oldboy, Unforgiven |
| **Redemption** | Second chances, atonement, forgiveness | Schindler's List, Gran Torino |
| **Sacrifice** | What we give up for others/causes, cost of heroism | Saving Private Ryan, Interstellar |
| **Truth** | Deception, revelation, self-deception, objective reality | Rashomon, The Truman Show |
| **Belonging** | Loneliness, community, found family, alienation | ET, Lilo & Stitch, Into the Wild |
| **Growth / Change** | Coming of age, transformation, adaptation | Boyhood, Inside Out, The Lion King |
| **Good vs Evil** | Moral conflict, shades of gray, choosing sides | Star Wars, No Country for Old Men |
| **Nature vs Technology** | Progress, ecological cost, human hubris | Jurassic Park, WALL-E, Princess Mononoke |
| **Fate vs Free Will** | Destiny, choice, determinism, agency | The Matrix, Arrival, Oedipus |
| **Memory** | Nostalgia, loss, identity through memory, forgetting | Eternal Sunshine, Inside Out, Coco |

#### 3.2 Theme vs Message vs Moral

| Term | Definition | Example |
|------|-----------|---------|
| **Theme** | The subject explored | "Power corrupts" |
| **Message** | The argument the story makes about the theme | "Absolute power corrupts absolutely, but love can redeem" |
| **Moral** | The explicit lesson (often absent in adult stories) | "Don't be greedy" |

**Key for pipeline:** S1 captures the THEME. The MESSAGE emerges from how the story resolves. The MORAL is optional (and often absent in sophisticated storytelling).

#### 3.3 How Theme Manifests Through Structure

Theme is not stated -- it is DEMONSTRATED through story structure:

```
Theme: "Isolation destroys"
  S1 structure: Circular (starts alone, ends alone)
  S2 characters: Arc from connection -> isolation
  S3 scenes: Gradually emptying rooms, shrinking world
  V mapping: L2 color desaturates, L3 framing widens (negative space)
```

**Every structural choice should serve the theme:**
- Structure type: circular = cycles/fate, non-linear = memory/truth
- POV: limited = isolation, omniscient = interconnection
- Turning points: where the theme is tested and proven

---

### 4. Turning Points / Beat Models

#### 4.1 Universal Turning Point Types

Regardless of structure model, all stories use these turning point types:

| Turning point | Function | Placement | Effect on audience |
|--------------|----------|-----------|-------------------|
| **Inciting Incident** | Disrupts status quo, creates story question | 10-15% | "Something happened! What next?" |
| **Point of No Return** | Protagonist commits | 20-25% | "They're in it now" |
| **Midpoint Reversal** | Major shift -- victory becomes defeat or vice versa | 45-55% | "Everything changed!" |
| **All Is Lost / Dark Night** | Protagonist at lowest point | 70-80% | "How can they possibly recover?" |
| **Climax** | Final confrontation, theme tested definitively | 80-95% | "This is it!" |
| **Resolution / Denouement** | New equilibrium, aftermath | 95-100% | "That's what it all meant" |

#### 4.2 Midpoint Theory

The midpoint is the most underappreciated turning point. It exists in virtually every successful story but is often invisible.

**Types of midpoint:**

| Type | Description | Example |
|------|-------------|---------|
| **False Victory** | Seems like hero won (but hasn't) | Aliens: "We secured the perimeter" (then aliens attack) |
| **False Defeat** | Seems like all is lost (but isn't yet) | The Martian: "I'm stranded" (then figures out water) |
| **Revelation** | New information changes everything | The Sixth Sense midpoint: "I see dead people" |
| **Commitment** | Stakes raise, hero commits fully | Die Hard: "Now I know what a TV dinner feels like" |
| **Mirror** | Midpoint mirrors the ending (inverted) | Pretty Woman: midpoint = business transaction, end = love |

#### 4.3 Climax Types

| Type | Mechanism | Best for |
|------|-----------|----------|
| **External confrontation** | Physical battle, showdown | Action, war, adventure |
| **Internal realization** | Character understands truth | Drama, coming-of-age |
| **Choice** | Protagonist must choose between values | Thriller, moral drama |
| **Sacrifice** | Hero gives up something precious | Tragedy, war, love story |
| **Revelation** | Truth exposed, changing everything | Mystery, thriller |
| **Convergence** | Multiple storylines collide | Ensemble, hyperlink narrative |

#### 4.4 Resolution / Denouement Types

| Type | Description | Effect |
|------|-------------|--------|
| **Closed** | All questions answered, clear ending | Satisfaction, closure |
| **Open** | Key questions left unanswered | Audience reflection, interpretation |
| **Ambiguous** | Deliberately unclear resolution | Discomfort, engagement (Inception) |
| **Bittersweet** | Win with cost, or loss with gain | Emotional complexity (La La Land) |
| **Twist** | Final revelation reframes everything | Shock, desire to rewatch (Sixth Sense) |
| **Circular** | Returns to opening situation/image | Thematic resonance (Shawshank) |

---

## PART 3: S0 x S1 -- Genre-Structure Compatibility Matrix

This is the critical intersection for verisimilitude. Wrong combinations break believability; right combinations feel inevitable.

---

### 1. The Compatibility Matrix

Rating system:
- **A (Natural)** = Audience expects this. Safe default.
- **B (Effective)** = Unusual but works well. Skilled choice.
- **C (Experimental)** = Difficult, requires exceptional execution. High risk/reward.
- **D (Problematic)** = Typically fails. Structural DNA conflicts with genre DNA.

| Genre \ Structure | 3-Act | Ki-Seung-Jeon-Gyeol | Kishotenketsu | Hero's Journey | Save the Cat | 5-Act | Non-Linear | Circular | Frame | Rashomon | Episodic |
|-------------------|-------|---------------------|---------------|----------------|-------------|-------|------------|----------|-------|----------|----------|
| **Action** | A | B | D | A | A | B | B | C | D | C | C |
| **Horror** | A | A | B | B | B | B | B | A | B | B | B |
| **Comedy** | A | B | B | B | A | C | B | A | B | B | A |
| **Drama** | A | A | B | B | A | A | B | A | A | B | B |
| **Thriller** | A | B | D | B | A | B | A | B | B | A | D |
| **Sci-Fi** | A | B | B | A | B | B | A | B | B | B | B |
| **Fantasy** | A | B | C | A | A | B | C | B | A | C | B |
| **Romance** | A | A | B | B | A | B | B | A | A | B | C |
| **Mystery** | A | C | D | B | A | B | A | B | A | A | D |
| **Western** | A | B | D | A | A | B | C | B | B | B | C |
| **War** | A | A | D | B | B | A | B | B | B | A | B |
| **Crime** | A | B | D | B | A | A | A | A | B | A | B |
| **Documentary** | B | A | A | B | C | B | B | B | A | A | A |
| **Musical** | A | B | C | A | A | C | C | B | B | D | B |

### 2. Detailed Compatibility Analysis

#### 2.1 Natural / Expected Combinations (A-rated)

These combinations are "default" -- audiences find them obvious and comfortable.

**Action + 3-Act / Hero's Journey / Save the Cat:**
Action NEEDS escalating conflict, clear turning points, and a climactic confrontation. All three structures provide exactly this framework. The Hero's Journey's "tests, allies, enemies" maps perfectly to action set pieces.

**Horror + 3-Act / Ki-Seung-Jeon-Gyeol / Circular:**
Horror works with 3-Act (escalating threat) and Ki-Seung-Jeon-Gyeol (the Jeon/twist is the horror revelation). Circular works beautifully (the horror returns / was never truly defeated). Horror + circular = "the cycle of fear."

**Mystery + 3-Act / Non-Linear / Rashomon / Frame:**
Mystery REQUIRES information control. Non-linear lets you reveal clues in dramatic order. Rashomon IS a mystery structure. Frame narrative allows a "storyteller" to control revelation. These are natural fits because mystery's engine (curiosity) aligns with these structures' information-release mechanisms.

**Thriller + Non-Linear / Rashomon:**
Thriller thrives on audience anxiety. Non-linear structure amplifies anxiety by withholding context. Rashomon creates paranoia (who's telling the truth?). Both enhance the core thriller emotion.

**Drama + 5-Act / Frame / Circular:**
Drama has the patience and character-depth to sustain 5-act falling action. Frame narrative adds reflective distance. Circular resonates with drama's thematic depth.

**Crime + Non-Linear / Circular / Rashomon / 5-Act:**
Crime stories naturally involve investigation (non-linear), moral cycles (circular), conflicting testimonies (Rashomon), and consequence/downfall (5-act). The genre's DNA overlaps with multiple structures.

#### 2.2 Unusual but Effective Combinations (B-rated)

These require skill but produce distinctive results.

**Horror + Kishotenketsu:**
Horror without escalating conflict? Yes -- slow-burn horror uses juxtaposition (normal life + wrongness) rather than escalation. J-horror and folk horror often operate closer to kishotenketsu than 3-act. Example: a family dinner, a child playing, a shadow that shouldn't be there, the family continues as if nothing happened. No confrontation. Pure dread.

**Comedy + Non-Linear:**
Pulp Fiction proves this. Non-linear + comedy creates jokes that DEPEND on the audience having seen later scenes first. Retroactive humor. Also: the incongruity of serious structure with silly content is itself comedic.

**Romance + Circular:**
Love stories that end where they began (but transformed) have powerful resonance. 500 Days of Summer uses a quasi-circular structure. Before Sunrise/Sunset/Midnight trilogy is circular across films.

**Sci-Fi + Kishotenketsu:**
Speculative fiction that doesn't resolve through conflict but through REALIZATION. Arrival (understanding the alien language recontextualizes everything). Solaris (the mystery isn't solved, it's accepted).

**War + Rashomon:**
Different soldiers experiencing the same battle differently. Dunkirk does this (though with parallel timelines rather than contradiction). The Thin Red Line uses multiple internal monologues approaching this.

**Documentary + Episodic / Kishotenketsu / Rashomon:**
Documentaries naturally suit non-conflict structures. Observational docs are inherently episodic. Rashomon structure works for investigative docs (conflicting accounts). Kishotenketsu's "twist" maps to documentary revelation.

#### 2.3 Problematic Combinations (D-rated)

These combinations have structural DNA conflicts that typically cause failure.

**Action + Kishotenketsu:**
Action needs kinetic escalation. Kishotenketsu's conflict-free engine directly contradicts action's core requirement. A "fight without fighting" is possible in philosophy, but action audiences expect visceral conflict.
*Exception:* Wuxia philosophical combat can approach this, but it bends rather than uses pure kishotenketsu.

**Mystery + Kishotenketsu / Episodic:**
Mystery REQUIRES information accumulation and revelation timing. Kishotenketsu's twist works differently from mystery's reveal -- it recontextualizes rather than solves. Episodic structure prevents the accumulation of clues needed for satisfying mystery resolution.
*Exception:* A mystery VIGNETTE can work episodically (like Sherlock Holmes short stories), but each episode IS a complete mystery.

**Thriller + Episodic:**
Thriller depends on SUSTAINED tension. Episodic structure resets tension with each vignette. The result feels like a series of short films, not a thriller.
*Exception:* Anthology horror (which overlaps thriller) can work episodically if each vignette maintains its own tension.

**Musical + Rashomon:**
Musical numbers require emotional sincerity (or at least commitment). Rashomon's "was this real?" undermines the audience's ability to invest in musical performances. If a character sang their heart out but maybe it didn't happen that way, the emotional impact collapses.
*Exception:* Chicago (musical numbers as fantasy/delusion) approaches this but uses a frame-within-frame, not true Rashomon.

**Western + Kishotenketsu:**
Western mythology is built on confrontation (showdown, homesteader vs outlaw, civilization vs wilderness). Conflict is so embedded in the genre's DNA that removing it removes the genre.
*Exception:* Revisionist western that deconstructs the mythology could approach this, but it would be anti-western rather than western.

### 3. Structural Requirements by Genre

Certain genres have MANDATORY structural elements. Missing these breaks the genre contract:

| Genre | Mandatory structural element | Why it's mandatory |
|-------|-----------------------------|--------------------|
| **Mystery** | Revelation/solution scene | Genre's promise is "you will find out" |
| **Mystery** | Clue distribution throughout | Unfair mystery = audience betrayal |
| **Horror** | Escalation of threat | Sustained low-level dread without escalation = atmosphere, not horror |
| **Romance** | Obstacle to union | Without obstacle, there's no romantic tension |
| **Romance** | Emotional vulnerability moment | Characters must open up or love isn't earned |
| **Action** | Physical climax | Words alone cannot resolve action's promise |
| **Thriller** | Information revelation timing | Too early = no tension. Too late = no payoff |
| **Comedy** | Comic timing/rhythm | Without rhythm, humor dies regardless of content |
| **War** | Cost/consequence shown | Glorifying without cost = propaganda, not war film |
| **Crime** | Moral consequence | Crime without consequence = fantasy, not crime |

### 4. Case Studies: Successful Unusual Combinations

#### Get Out (2017) -- Horror + Social Satire + 3-Act
- **Genre:** Horror (host) + Social Commentary (flavor)
- **Structure:** Clean 3-Act (setup-confrontation-resolution)
- **Why it works:** Horror's fear-engine is applied to racial dynamics. The 3-act structure provides familiar orientation while the CONTENT subverts horror conventions. Standard structure + subversive content = accessible innovation.
- **S0:** Horror / Satirical tone / Fear + Recognition
- **S1:** 3-Act / Third person limited (Chris's experience) / Theme: racist liberal hypocrisy

#### Memento (2000) -- Neo-Noir Mystery + Reverse Chronological
- **Genre:** Mystery/Thriller (host) + Noir (flavor)
- **Structure:** Reverse chronological (color) + forward chronological (B&W), converging
- **Why it works:** The structure IS the story. Leonard's amnesia means he experiences life without continuous memory -- and so does the audience. The form delivers the content's message. Non-linear structure serves mystery (information revelation) AND character (memory loss).
- **S0:** Mystery-Thriller / Dark, disorienting tone / Paranoia + Curiosity
- **S1:** Non-linear (reverse) / First person effect through structure / Theme: self-deception

#### Pulp Fiction (1994) -- Crime + Dark Comedy + Mosaic Non-Linear
- **Genre:** Crime (host) + Dark Comedy (flavor)
- **Structure:** Three linear stories presented non-linearly with character overlap
- **Why it works:** Non-linear structure creates thematic juxtaposition that chronological order wouldn't. Vincent Vega dies in the middle but appears alive at the end -- the non-linear order makes death less "final" and more arbitrary, reflecting the film's themes.
- **S0:** Crime / Irreverent, dark-comic tone / Fascination + Amusement
- **S1:** Non-linear mosaic / Shifting third-person limited / Theme: randomness of violence

#### Parasite (2019) -- Genre-Shifting (Comedy -> Thriller -> Horror -> Tragedy) + Modified 3-Act
- **Genre:** Shifts across the film (Dark Comedy Act 1 -> Thriller Act 2 -> Horror/Tragedy Act 3)
- **Structure:** 3-Act with a devastating midpoint reversal
- **Why it works:** The genre shift IS the story's argument. As the Kim family rises (comedy), the ground gives way (thriller), and they discover they're not the only ones hiding (horror). The tonal shifts mirror class dynamics.
- **S0:** Drama / Shifting tone (darkening) / Fascination -> Anxiety -> Horror -> Grief
- **S1:** 3-Act with radical midpoint / Shifting limited POV (Kim family first, then expanding) / Theme: systemic inequality

#### Arrival (2016) -- Sci-Fi + Non-Linear (disguised as linear)
- **Genre:** Sci-Fi (host) + Drama (flavor)
- **Structure:** Appears linear but is actually non-linear -- the "flashbacks" are FLASH-FORWARDS
- **Why it works:** The structure IS the twist. The audience assumes a linear structure and interprets scenes accordingly. The revelation that the structure was non-linear all along recontextualizes the entire film. Form = content (learning the alien language changes perception of time, and the film's structure does the same to the audience).
- **S0:** Sci-Fi / Melancholic, contemplative tone / Wonder + Grief + Acceptance
- **S1:** Non-linear (disguised as linear) / Third person limited (Louise) / Theme: accepting loss as the price of love

#### Midsommar (2019) -- Horror + Ki-Seung-Jeon-Gyeol influence
- **Genre:** Horror (host) + Drama (flavor)
- **Structure:** Closer to Ki-Seung-Jeon-Gyeol than traditional 3-Act:
  - Ki: Dani's trauma, relationship failing
  - Seung: Commune seems nice, rituals escalate slowly
  - Jeon: The TURN -- what seemed supportive IS the horror
  - Gyeol: Dani's smile -- acceptance, not victory
- **Why it works:** Horror without the standard "escape" climax. The horror is recontextualization, not confrontation. The ending is disturbing BECAUSE it feels like resolution rather than survival.
- **S0:** Horror / Bright, unsettling, grief-laden tone / Dread + Discomfort + Ambiguous catharsis
- **S1:** Ki-Seung-Jeon-Gyeol-influenced / Third person limited (Dani) / Theme: grief, codependence, belonging at a price

---

### 5. S0 x S1 Forward Hints for Pipeline

When a user selects S0 (genre/tone), the pipeline should automatically generate Forward Hints about compatible S1 choices:

```
User selects: Horror / Dark tone / Fear+Dread

Forward Hint:
  RECOMMENDED structures:
    - 3-Act (classic escalation, safe choice)
    - Circular (the horror returns -- very effective for horror)
    - Ki-Seung-Jeon-Gyeol (slow burn, recontextualization horror)
  
  INTERESTING structures:
    - Non-linear (disorientation amplifies dread)
    - Frame narrative (someone telling a horror story adds meta-fear)
    - Rashomon (conflicting accounts of what happened -- paranoia)
  
  CAUTION structures:
    - Episodic (resets tension between vignettes)
    - Kishotenketsu (conflict-free engine contradicts horror's threat requirement)
    - Save the Cat (overly mechanical for horror's atmosphere needs)
  
  RECOMMENDED POV:
    - First person (maximum vulnerability)
    - Third person limited (classic horror POV)
    - Unreliable narrator (is the horror real or imagined?)
  
  CAUTION POV:
    - Third person omniscient (knowing everything reduces fear)
```

---

### 6. Complete Parameter Map for S0 + S1

#### S0 Parameters

```
S0_genre:
  primary: string              # "Horror", "Comedy", etc.
  secondary: string | null     # Hybrid flavor: "Comedy" in "Horror-Comedy"
  sub_genre: string | null     # "Folk Horror", "Screwball Comedy"
  cultural_pathway: string     # "Hollywood", "K-Drama", "Bollywood", "Anime", etc.

S0_tone:
  lightness: enum              # [lighthearted, warm, neutral, somber, dark, pitch_black]
  seriousness: enum            # [earnest, serious, wry, playful, satirical, ironic, absurdist, cynical]
  temperature: enum            # [hopeful, melancholic, nostalgic, anxious, cathartic, euphoric, desolate]
  register: enum               # [naturalistic, heightened, operatic, surreal, poetic, gritty, whimsical, clinical, dreamlike, frenetic]
  
S0_target_emotion:
  primary: string              # "Fear", "Amusement", "Empathy", etc.
  secondary: string[]          # ["Relief", "Disgust"]
  emotional_trajectory: enum   # [escalating, rhythmic, sustained, darkening, brightening, oscillating]

S0_format:
  runtime_category: enum       # [short_form, mid_form, long_form]  
  runtime_seconds: number      # Target runtime
```

#### S1 Parameters

```
S1_structure:
  type: enum                   # [three_act, ki_seung_jeon_gyeol, kishotenketsu, heros_journey, 
                               #  save_the_cat, five_act, non_linear, circular, frame_narrative,
                               #  rashomon, episodic, in_medias_res]
  turning_points:
    inciting_incident: number  # Position as % of runtime (0-100)
    midpoint: number           # Position as %
    climax: number             # Position as %
    resolution: number         # Position as %
  scene_count_hint: number     # Expected number of scenes

S1_pov:
  type: enum                   # [first_person, third_limited, third_omniscient, 
                               #  shifting, unreliable, second_person, objective]
  focal_character: string | null  # Primary POV character (if limited)
  reliability: enum            # [reliable, questionable, unreliable, deliberately_deceptive]

S1_theme:
  primary: string              # "Freedom", "Identity", "Power", etc.
  secondary: string[]          # Supporting themes
  message_direction: string    # What the story argues about the theme

S1_climax:
  type: enum                   # [external_confrontation, internal_realization, choice, 
                               #  sacrifice, revelation, convergence]
  position: number             # % of runtime

S1_resolution:
  type: enum                   # [closed, open, ambiguous, bittersweet, twist, circular]
```

---

### 7. S0xS1 Compatibility Validation Rules

When user finalizes S0 and S1, the pipeline should run these validation checks:

```python
# Pseudo-code for compatibility checking

def validate_S0xS1(s0, s1):
    warnings = []
    errors = []
    
    # Genre-Structure compatibility
    compat = COMPATIBILITY_MATRIX[s0.genre.primary][s1.structure.type]
    if compat == "D":
        warnings.append(f"WARNING: {s0.genre.primary} + {s1.structure.type} typically conflicts. "
                        f"Reason: {CONFLICT_REASONS[s0.genre.primary][s1.structure.type]}")
    
    # Mandatory structural elements
    for element in MANDATORY_ELEMENTS[s0.genre.primary]:
        if not s1.has_element(element):
            errors.append(f"ERROR: {s0.genre.primary} requires {element}")
    
    # POV-Genre compatibility
    if s0.genre.primary == "Horror" and s1.pov.type == "third_omniscient":
        warnings.append("WARNING: Omniscient POV reduces fear (audience knows too much)")
    
    if s0.genre.primary == "Mystery" and s1.pov.type == "third_omniscient":
        warnings.append("WARNING: Omniscient POV eliminates mystery (audience knows the answer)")
    
    # Tone-Structure compatibility
    if s0.tone.lightness in ["dark", "pitch_black"] and s1.structure.type == "kishotenketsu":
        warnings.append("NOTE: Dark tone + conflict-free structure = existential dread (valid but demanding)")
    
    # Emotional trajectory - Structure alignment
    if s0.target_emotion.trajectory == "escalating" and s1.structure.type == "episodic":
        warnings.append("WARNING: Escalating emotion + episodic structure conflicts (episodic resets)")
    
    # Cultural pathway alignment
    if s0.genre.cultural_pathway == "Bollywood" and s1.structure.type == "kishotenketsu":
        warnings.append("NOTE: Bollywood typically uses melodramatic arc, not conflict-free structure")
    
    return {"errors": errors, "warnings": warnings, "rating": compat}
```

---

## APPENDIX A: Quick Reference -- Genre DNA Summary

| Genre | Must have | Usually has | Never has | Core emotion | Natural structure |
|-------|----------|-------------|-----------|-------------|------------------|
| Action | Physical conflict, high stakes | Clear villain, set pieces, one-liner | Lack of physical resolution | Excitement | 3-Act, Hero's Journey |
| Horror | Threat, dread, fear | Jump scares, isolation, darkness | Safety guarantee | Fear | 3-Act, Circular |
| Comedy | Laughter, incongruity | Happy ending, escalation | Sustained sadness without relief | Amusement | 3-Act, Save the Cat |
| Drama | Emotional depth, character arc | Internal conflict, catharsis | Trivializing of real issues | Empathy | 3-Act, 5-Act, Ki-Seung |
| Thriller | Sustained tension, stakes | Twist, ticking clock | Relaxation | Anxiety | 3-Act, Non-Linear |
| Sci-Fi | Speculative element, "what if" | World-building, technology | Magic without rules | Wonder | 3-Act, Hero's Journey |
| Fantasy | Impossible made real, internal rules | Quest, prophecy, chosen one | Science as solution | Enchantment | Hero's Journey, 3-Act |
| Romance | Love, obstacle, vulnerability | Happy ending, grand gesture | Permanent emotional numbness | Love | 3-Act, Circular |
| Mystery | Puzzle, clues, revelation | Red herrings, detective figure | Unsolvable with no attempt | Curiosity | 3-Act, Non-Linear |
| Western | Frontier, moral code, confrontation | Showdown, stranger arrives | Urban setting | Awe/Tension | 3-Act, Hero's Journey |
| War | Armed conflict, human cost | Brotherhood, sacrifice | Trivializing death | Tension/Grief | 3-Act, 5-Act |
| Crime | Criminal activity, moral gray | Rise-and-fall, consequences | Moral simplicity | Fascination | 3-Act, 5-Act, Non-Linear |

## APPENDIX B: Tone-to-V-Axis Quick Mapping

When S0 tone is set, these V-axis directions are suggested:

| Tone | L1 Style direction | L2 Color direction | L3 Camera/Light direction |
|------|-------------------|-------------------|--------------------------|
| **Lighthearted** | Rounded, bright, clean | High saturation, warm | High key, smooth movement |
| **Dark** | Angular, high-contrast | Desaturated, cool | Low key, shadows, static or unsettling |
| **Earnest** | Naturalistic, warm | Earth tones, balanced | Eye level, steady, classical |
| **Satirical** | Heightened, slightly off | Over-saturated or deliberately wrong | Slightly wide lens, formal composition |
| **Melancholic** | Soft, painterly | Muted, blue-shifted | Slow dolly, soft light, negative space |
| **Anxious** | Gritty, hand-held feel | Desaturated, yellow-green | Tight framing, shallow DOF, unstable |
| **Surreal** | Distorted, non-naturalistic | Impossible colors, high-contrast | Dutch angle, unusual lenses, discontinuity |
| **Poetic** | Beautiful, composed | Rich but restrained | Long takes, fluid movement, natural light |
| **Gritty** | Textured, rough | Desaturated, brown/gray | Handheld, available light, tight spaces |
| **Whimsical** | Quirky, symmetrical | Pastel or candy-colored | Centered framing, tracking shots |

---

## APPENDIX C: Structure Decision Flowchart

```
Is your story conflict-driven?
  │
  ├── YES: Is the protagonist on a journey of transformation?
  │    ├── YES: Hero's Journey
  │    └── NO: Is it commercially targeted?
  │         ├── YES: Save the Cat / 3-Act
  │         └── NO: Does it have extensive consequences/falling action?
  │              ├── YES: 5-Act
  │              └── NO: 3-Act
  │
  └── NO: Is it driven by juxtaposition/realization?
       ├── YES: Kishotenketsu
       └── NO: Is it about multiple perspectives on truth?
            ├── YES: Rashomon
            └── NO: Is it about cycles/return?
                 ├── YES: Circular
                 └── NO: Is information revelation order critical?
                      ├── YES: Non-Linear
                      └── NO: Ki-Seung-Jeon-Gyeol or Episodic
```

---

## Sources

Research informed by:
- [Film Genre - Wikipedia](https://en.wikipedia.org/wiki/Film_genre)
- [The 12 Basic Film Genres And Their Sub-Genres - Foximusic](https://www.foximusic.com/the-12-basic-film-genres-and-their-sub-genres/)
- [Genre Studies in Film - Literary Latitude](https://literarylatitude.com/2025/03/21/genre-studies-in-film-definition-theories-critics-and-indian-examples/)
- [The Ultimate Guide to Film Genres - So The Theory Goes](https://www.sothetheorygoes.com/the-history-of-genre-film/)
- [Genre Theory - Film Studies 2270](https://filmstudies2270.wordpress.com/genre-theory/)
- [Kishotenketsu - Wikipedia](https://en.wikipedia.org/wiki/Kish%C5%8Dtenketsu)
- [Kishotenketsu: Exploring The Four Act Story Structure - Art of Narrative](https://artofnarrative.com/2020/07/08/kishotenketsu-exploring-the-four-act-story-structure/)
- [Kishotenketsu and Non-Western Story Structures - Nelson Literary Agency](https://nelsonagency.com/2022/01/kishotenketsu-and-non-western-story-structures/)
- [Film Tone and Style - MasterClass](https://www.masterclass.com/articles/film-tone)
- [The Power Of Tone - ActionVFX](https://www.actionvfx.com/blog/the-power-of-tone)
- [How to Think About Tone - Script Anatomy](https://scriptanatomy.com/how-to-think-about-tone/)
- [Save the Cat Beat Sheet - StudioBinder](https://www.studiobinder.com/blog/save-the-cat-beat-sheet/)
- [Save the Cat Beat Sheet: 15 Beats - Kindlepreneur](https://kindlepreneur.com/save-the-cat-beat-sheet/)
- [Freytag's Pyramid - MasterClass](https://www.masterclass.com/articles/freytags-pyramid)
- [Five-Act Structure - MasterClass](https://www.masterclass.com/articles/five-act-structure)
- [Hero's Journey - Wikipedia](https://en.wikipedia.org/wiki/Hero's_journey)
- [Hero's Journey: 12 Steps - Scrite](https://www.scrite.io/heros-journey-12-steps-examples-use-cases/)
- [Christopher Vogler's Hero's Journey Arc](https://heroinejourneys.com/christopher-voglers-heros-journey-arc/)
- [Break Genre Rules Like a Master Filmmaker - PremiumBeat](https://www.premiumbeat.com/blog/break-genre-rules-master-filmmaker/)
- [7 Films That Subverted Genre Codes - Raindance](https://raindance.org/7-films-subverted-genre-codes-better/)
- [10 Films That Defy Genre Conventions - ScreenCraft](https://screencraft.org/blog/10-films-that-defy-genre-conventions/)
- [Non-Linear Narratives: Memento and Pulp Fiction - Big Picture Film Club](https://bigpicturefilmclub.com/non-linear-narratives-memento-pulp-fiction-storytelling/)
- [Memento & Pulp Fiction Non-Linear Storytelling - Movie Outline](https://www.movieoutline.com/articles/screenwriting-structure-series-part-4-memento-and-pulp-fiction-non-linear-story-telling.html)
- [Understanding POV in Film - PremiumBeat](https://www.premiumbeat.com/blog/understanding-pov-in-film-and-video/)
- [Third Person POV in Film - NFI](https://www.nfi.edu/third-person-point-of-view/)
- [First Person POV - StudioBinder](https://www.studiobinder.com/blog/what-is-first-person-point-of-view-definition/)
- [Unreliable Narrator - StudioBinder](https://www.studiobinder.com/blog/what-is-an-unreliable-narrator-definition/)
- [Rashomon Effect - Wikipedia](https://en.wikipedia.org/wiki/Rashomon_effect)
- [What is the Rashomon Effect - StudioBinder](https://www.studiobinder.com/blog/what-is-the-rashomon-effect-definition/)
- [Circular Storytelling - Industrial Scripts](https://industrialscripts.com/circular-storytelling/)
- [Genre Conventions - Film Lifestyle](https://filmlifestyle.com/genre-conventions/)
- [Genre Conventions, Expectations, Subversions - Fiveable](https://fiveable.me/understanding-film/unit-4/genre-conventions-expectations-subversions/study-guide/Jq0ARTcG4mxHyM0w)
- [Genre Conventions in Screenwriting - Fiveable](https://fiveable.me/screenwriting-ii/unit-7)
