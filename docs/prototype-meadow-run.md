# Prototype Level — Sky Raid: "Meadow Run"

> The vertical-slice prototype for **TJC: Family Adventures**. One complete level,
> 3-player co-op, built to prove the core hypothesis. Pairs with `brief.md`
> (the game's overall design spec).

---

## 1. The Fantasy

A green meadow-moon has been overrun by **junkbots** that caged its animals. The
crew flies their ship **upward** through the moon's airspace — blasting invaders,
freeing the captured critters (each player's own favorite animals), beating the
**Warden** that guards the rest, and escaping before the moon destabilizes.

**Camera:** mostly **top-down with a slight forward tilt** (à la *Raiden*) so you
see incoming threats and the 3D scenery shows its form. Constant **vertical scroll
moving UP** — the world streams *downward* past the ship, which roams the full
board and weaves like a classic shmup.

**Inspiration — _Raiden_.** This level chases the feel of the classic top-down
shooter: a brisk constant scroll over detailed terrain, a small nimble ship with
room to weave, **ground _and_ air targets**, floating **power-ups** that
swap/upgrade weapons, screen-clearing **bombs**, dense-but-readable action, and a
big boss to finish. We keep that energy but swap pure destruction for our
**rescue** twist — freeing caged animals (green-tag) amid the junkbot assault.
Mapping Raiden → TJC:
- red/blue weapon medals → the **Gunner's** weapon switch + upgrades
- bombs → a **Spotter** "big boom" / screen-clear assist
- ground turrets + air wings → our **turrets, drones, rammers**
- floating pickups → **powerups + fruit/berries** collectibles

---

## 2. What This Prototype Must Prove

If these land, the concept works:

1. **Three humans, three devices, one vessel, at the same time** feel coherent
   and fun together.
2. The **shared "table" screen (laptop) + role-tailored phone stations** model
   works in practice.
3. The **overheat → cooldown** beat creates a real out-loud *"CLOE, COOL IT
   DOWN!"* moment. ← the single most important thing.
4. The **hull-patch** assist makes the youngest clutch for the Pilot too.
5. **Green-tag rescue** of a player's *own favorite animal* lands emotionally.
6. **Personal-record + Family-PR** scoring feels motivating, not competitive.
7. **Rally to Revive** turns a near-loss into the family scrambling to *save each
   other* — proving the graceful fail-state (you get saved, you don't just "lose").

Everything else is polish.

---

## 3. Level Shape (timeline)

A full run is ~**4.5–5.5 minutes**, in seven phases that each teach/exercise one
thing, then combine at the boss.

| # | Phase | ~Time | Teaches / exercises |
|---|---|---|---|
| 0 | **Launch** | 0:00–0:20 | Pilot movement, Spotter tapping shinies (calm, no enemies) |
| 1 | **First Contact** | 0:20–1:10 | Gunner aim/fire, Spotter red-tag → lock-on |
| 2 | **First Rescue** | 1:10–1:45 | Green-tag rescue of a favorite animal |
| 3 | **Heat Wave** | 1:45–2:45 | **Overheat → cooldown** (the hero beat) |
| 4 | **The Gauntlet** | 2:45–3:45 | Pilot dodging, **hull breach → patch**, **first down → rally (scripted)**, rescue under pressure |
| 5 | **The Warden** | 3:45–5:00 | Boss — *requires all three roles at once*, **down → rally under fire** |
| 6 | **Extract** | 5:00–5:30 | Timed escape, collect freed animals |
|   | **Results** | — | PR bars, Family PR, fun facts, menagerie update |

### Zones — terrain bands over the phases

The seven phases are grouped into **four biome zones**. Zones are the *visual +
difficulty arc*; the phases stay the *mechanic-teaching* beats inside them. The
field **auto-scrolls** straight through — zones are distance/time markers, **not
gates** (no one can get stuck; a struggling player just drifts forward into the
next biome).

**Difficulty model (two layers):**
- **Stakes & variety ramp for the whole crew** — each zone adds more rescues,
  new hazards/obstacles, and tighter-but-fair timing. Same for everyone; this is
  what drives the felt escalation.
- **Lethality scales per player tier** — how *punishing* the threats are (enemy
  count, fire rate, damage) is dialed by each player's complexity tier (§5), so
  the same zone is gentler for a T1 kid than a T3 parent. Nobody gets walled, no
  one gets bored.

| Zone | Biome / ground | Lighting | Phases | What escalates | Seam into next |
|---|---|---|---|---|---|
| **1 · Meadow** | open grass (`painterly`) | `golden` | 0 Launch · 1 First Contact · 2 First Rescue | teach controls; first easy bunny rescue; sparse drones | meadow thickens into a **treeline** |
| **2 · Woodland** | dense, darker (`painterly` + tree tile) | `overcast` | 3 Heat Wave | trees become a dodge-gauntlet; swarms force sustained fire (→ overheat beat); more rescues | trees give way to a **canyon mouth** |
| **3 · Canyon** | rock/stone (`stripes` → rock tile) | `dramatic` | 4 The Gauntlet | narrow lanes, junk pillars, turrets, rammers; hull-breach + scripted down→rally; high-value cheetah/sloth rescues in side pockets | canyon opens onto the **Warden's scorched lair** |
| **4 · Approach** | scorched ground, hazy | `dramatic` / `moonlit` | 5 The Warden · 6 Extract | the all-roles boss, then the destabilizing escape (scroll ramps up) | — (exit portal) |

**Seams (transitions).** Between zones a short ~2–3s **transition band** — a
treeline, a canyon mouth, a fog/ash bank — blends one biome into the next and
gives a deliberate lull between intensity spikes. No hard ground swaps.

**Implementation shape.** A zone is a **data bundle**: ground style + (optional)
tile texture + lighting preset + prop mix + scroll speed + spawn table. The scene
already swaps ground, lighting, props, and scroll live (and the recent split into
`lighting-controller` / `prop-field` / `ground-texture` makes each knob a clean
seam), so a "level" is a distance-driven *sequence* of these bundles with a blend
band between — the config-driven scene plan we were already heading toward. Mostly
**content + a small sequencer**, not new rendering tech.

---

## 4. Phase-by-Phase Walkthrough

### Phase 0 — Launch (calm)
Ship lifts off; meadow scrolls down. A few **shiny powerups** drift toward the
ship. Dad gets a feel for steering; Cloe taps shinies to pop them; Junie test-
fires into empty sky. No threats. *Purpose: everyone finds their controls.*

### Phase 1 — First Contact
**Junkbot drones** enter from the top in simple formations (lines, then a small
V). Junie shoots them down. One drone hangs back at the screen edge, half-hidden
behind a rock spire — Cloe **swipes to find it and taps it (red tag)**; it
highlights on the shared screen and Junie's lock-on shots track it. *Purpose:
aim/fire + the Spotter sees what the Gunner can't.*

### Phase 2 — First Rescue
A **cage** scrolls in holding **Cloe's bunnies** (her pick) — an easy, plentiful
first rescue. The shared screen gives it a soft spotlight. Cloe **taps the cage
(green tag)** → Dad steers so the ship passes near it → a **tractor beam** beams
the bunnies up → **menagerie + the bunch**, confetti, sound sting. *Purpose: the
rescue loop and its payoff.*

### Phase 3 — Heat Wave (the hero beat)
A dense **swarm** pours in; the only way through is sustained fire. Junie's
**heat bar fills → OVERHEAT, weapon locks**. A giant **COOL IT DOWN!** button
fills Cloe's phone → she **rapid-taps** → heat drains → weapon roars back. Happens
~2 times this phase, escalating. Clearing the swarm opens the path upward.
*Purpose: the signature collaboration — Junie literally cannot continue without
Cloe.*

### Phase 4 — The Gauntlet
A hazard corridor: **junk pillars** and **drifting debris** to weave through,
plus **turret emplacements** firing upward. Dad must dodge and **boost** through
gaps. A **rammer bot** clips the hull → **HULL BREACH**, a **PATCH!** button hits
Cloe's phone → she taps to seal it. Two more cages — **Junie's cheetah** (tag it
fast before it streaks off) and **Dad's sloth** (a slow beam-up Dad must hold
position to protect) — are tucked in side pockets that require a detour. *Purpose: piloting
under pressure + the patch assist + multi-rescue.*

Near the corridor's end, a heavy turret barrage drops **Hull to CRITICAL** and a
telegraphed shot **downs the Gunner** — Junie's station goes dark. A big **SAVE
JUNIE!** fills Dad's and Cloe's stations; they **rapid-tap together** → the revive
meter fills → Junie's guns roar back and the rally stabilizes the hull. *Purpose:
teach **down → rally** in a controlled spot before the boss.*

### Phase 5 — The Warden (boss)
A massive junkbot, the **Warden**, blocks the way, clutching a **big cage of
several captured animals**. Three health phases:

- **Attacks:** a sweeping **laser arm** (Dad dodges), periodic **add spawns**
  (Junie clears), and **armored weak points** that open on a timer.
- **The all-roles loop:** weak points glow faintly and off-center — **Cloe tags
  them** so Junie can find/lock them; **Junie focuses fire** (and **overheats** →
  **Cloe cools**); the Warden's slams cause **hull breaches** → **Cloe patches**;
  **Dad dodges** the sweep and **positions** for clean shots.
- **Down → rally under fire:** in the Warden's final phase a big telegraphed slam
  can **down a crew member**. The others must **rapid-tap SAVE [name]!** *while
  still surviving the fight* — the ship is a station short and very exposed, so
  it's the tensest, most heroic beat of the whole level.
- Each phase down escalates attack speed and exposes more weak points. Third
  phase down → the Warden cracks open, cage releases.

*Purpose: the climax that is impossible without every role doing its job.*

### Phase 6 — Extract
The moon starts to destabilize: **scroll speed ramps up**, falling debris rains
down. The freed animals float up as collectibles — grab them on the way to the
**exit portal** at the top. Reach the portal → **level complete**. *Purpose: a
tense, triumphant finish.*

### Results
- Three **PR bars** fill past last run's line (per-role metrics, §6).
- **Family PR** for Meadow Run (per-level).
- **Fun facts:** *"⭐ Cloe rescued all her animals!"*, *"⭐ Junie — new accuracy
  best"*, *"⭐ Dad — 0 hull lost."*
- **Menagerie** updates with the run's rescues.

---

## 5. Exact Controls Per Role & Tier

The prototype is played by the test crew: **Dad = Pilot T3, Junie = Gunner T2,
Cloe = Spotter T1** (bold = built for the prototype). Other tiers are noted so the
ladders are clear.

### Pilot — keyboard (Dad, **T3**)
| Action | Input |
|---|---|
| Move (2D, lower ~65% of screen) | Arrow keys / WASD |
| Nudge scroll speed | `W`/`Up` push faster · `S`/`Down` ease back |
| **Boost dodge** (burst + brief i-frames) | `Space` or `Shift` — drains Boost energy |
| Tractor beam (auto when near green-tagged cage) | passive |
| **Rally a downed member** (on SAVE prompt) | mash `R` (or `Space`) |

- **T1:** move only; heavy auto-brake; cannot fatally crash; auto-slows near
  hazards.
- **T2:** free movement + boost; one resource to manage (Boost).
- **T3 (prototype):** momentum/inertia in the flight model, manual speed control,
  and **route forks** in the Gauntlet (pick the safe line).

### Gunner — mouse (Junie, **T2**)
| Action | Input |
|---|---|
| Aim | move mouse → crosshair |
| Fire primary | hold **Left-click** |
| Switch weapon | **Mouse wheel** or `1`/`2` |
| Lock-on (guided) | hover crosshair over a **red-tagged** target to build lock |
| **Rally a downed member** (on SAVE prompt) | mash **Left-click** the SAVE button |
| (Heat is automatic — see §6) | — |

Prototype weapons (pick 2 in a 30-sec pre-level loadout):
- **Blaster** — rapid, low damage, **low heat**.
- **Cannon** — slow, high damage, **high heat** (the one that overheats fast).
- **Lock Missiles** — track red-tagged targets (rewards the Spotter's tags).

- **T1:** click to shoot, one weapon, strong auto-aim, **no heat**.
- **T2 (prototype):** precise aim, 2–3 weapons, **heat management**, simple
  loadout.
- **T3:** full loadout builder, ammo economy, weapon synergies, manual priority
  targeting.

### Spotter — phone touch (Cloe, **T1**)
| Action | Input |
|---|---|
| Roam the view | **swipe/drag** to pan a spotlight window over the field |
| Tag (context-aware) | **tap** — enemy = red (priority + Gunner lock), cage = green (rescue) |
| Pop powerup | **tap** a shiny |
| **COOL IT DOWN!** (on overheat) | **rapid-tap** the big button |
| **PATCH!** (on hull breach) | **tap** the big button to seal |
| **SAVE [name]!** (on a crew-down) | **rapid-tap** the big button to revive |

Tap zones are oversized and forgiving; tags are auto-typed by what's tapped (no
choosing). **No fail state** — Cloe's actions only ever help.

- **T1 (prototype):** tap-only, big targets, auto-typed tags, generous windows.
- **T2:** choose tag type, **pinch-zoom**, limited "boom" charges, **timing-based**
  assists (tap in the sweet zone to cool faster).
- **T3:** paint targets for guided weapons, hazard callouts, radar/minimap,
  proactively vent before overheats happen.

---

## 6. Shared Systems & Tunable Numbers

Starting values to build and balance against (all tunable):

**Hull (shared, v1)** — start **100**. Drone shot **−5**, turret shot **−8**,
ram/collision **−15**, Warden sweep **−20**. At **Hull 0** the ship is
**CRITICAL** (flashing); the next decisive hit **downs a crew member** rather than
ending the run (see Down & Rally below). Forgiving for the prototype.

**Down & Rally (shared, v1)** — while Hull is **CRITICAL**, the next decisive hit
**downs a crew member**; their station goes offline. Who goes down is read from
the hit (collision → **Pilot**, station hit → **Gunner**, Warden slam → its
**telegraphed target**), so it always feels fair. If the **Pilot** is downed the
ship **drifts** (auto-holds, no steering) until revived. A **SAVE [name]!** prompt
appears on **every other** station; rescuers **rapid-tap** to fill a **revive
meter** — **+7 per tap**, need **~100** (≈ **15 combined taps**) within a
**6-second** window. On success: station back online, **Hull restored to 30**,
**2-sec invuln**. While reviving, rescuers aren't doing their own jobs → the ship
is exposed (that's the tension). **Mission fails only** if the window lapses or the
**whole crew is down at once** — a rare, graceful loss.

**Heat (Gunner, v1)** — **0–100**. Blaster **+6/sec** firing; Cannon **+20/shot**.
Passive cool **+8/sec** when not firing. At **100 → OVERHEAT lock**. Cleared by:
Spotter rapid-tap (**−12 per tap**) *or* slow passive drain if no Spotter present
(per the §9 crew-scaling rule in `brief.md`). With a Spotter, Cloe is the fast
path back online.

**Patch (Spotter)** — seals an active hull breach (stops the leak) **+ restores
10 Hull**.

**Boost (Pilot, per-role energy)** — **100**, drains **40/sec** while boosting,
regens **15/sec**.

**Salvage** — dropped by destroyed bots; feeds the pre-level loadout/upgrades.

**Scoring metrics for Meadow Run (per `brief.md` §13):**
- **Pilot:** hull preserved %, clean dodges, longest no-hit streak.
- **Gunner:** accuracy %, bots destroyed, Warden weak-points hit.
- **Spotter:** animals tagged, shinies popped, **assists delivered** (cools +
  patches), in-time assist rate.
- **Family PR:** animals rescued / total, hull remaining, clear time, longest
  assist chain, **members rallied back from down**.
- *All roles also score **revive taps contributed** during rallies.*

---

## 7. Screen Layout

```
   LAPTOP — the shared "table" (everyone watches)
   ┌──────────────── moving UP ▲ ────────────────┐
   │        · exit portal (Phase 6) ·            │
   │   junkbots ▼   cage[🐆]   debris ▼          │
   │      ✦ shiny        turret◗                 │
   │   ┌─Hull ██████░░  Heat ███░░  Boost ████░─┐│
   │            ╱▲╲  ← the ship (pilot flies)    │
   └─────────────────────────────────────────────┘

   JUNIE (mouse on laptop)     CLOE (phone station)
   crosshair + fire + weapons  ┌───────────────────┐
                               │ [pan / spotlight] │
                               │  tap=tag  tap=pop │
                               │  ┌─────────────┐  │
                               │  │ COOL IT DOWN!│ │ ← on overheat
                               │  └─────────────┘  │
                               │  [ PATCH! ]       │ ← on breach
                               │  [ SAVE JUNIE! ]  │ ← on a crew-down
                               └───────────────────┘
```

---

## 8. Object & Enemy Glossary (prototype asset list)

- **Ship** — the shared vessel (one sprite + tractor-beam + thruster anims).
- **Junkbot drone** — basic enemy, simple formations.
- **Turret emplacement** — ground-fixed, fires upward.
- **Rammer bot** — charges the ship (causes breaches).
- **Junk pillar / debris** — static & drifting obstacles.
- **Cage** — holds one animal; green-tag → tractor → rescue.
- **Animals** — the crew's chosen favorites; **v1 roster: bunnies, fox, sloth,
  cheetah** (see *Starter animals* below).
- **Shiny powerup** — tap-to-pop collectible.
- **The Warden** — boss: body + sweeping laser arm + armored weak points + the
  big captives' cage.
- **Exit portal** — Phase 6 goal.

### Starter animals (v1 rescue roster)

Players pick favorites from this roster; rarer animals are worth more, and each
has a personality that drives its rescue mechanic:

| Animal | Rarity | Value | Rescue behavior |
|---|---|---|---|
| **Bunnies** | common (bunches of 2–4) | **1 each** | quick, easy beam-up — volume rescue, lots of green tags |
| **Fox** | uncommon | **3** | skittish — the cage rattles and the fox **bolts if not tagged fast** (short window), then a quick beam-up |
| **Sloth** | rare | **5** | slow — a long, leisurely beam-up; **hold position and protect it** the whole time (a "come on, buddy!" beat) |
| **Cheetah** 🐆 | rare | **8** | *fast!* streaks across the field — a **very short tag window**; miss it and it bolts away. Highest risk, highest reward. |

Gives the Spotter/Gunner a **prioritization** layer (safely protect the slow sloth
vs. chase the speedy high-value cheetah vs. sweep up bunnies) and each animal a
memorable feel. Example picks for the test crew: **Cloe → bunnies, Junie →
cheetah, Dad → sloth** (configurable per profile).

---

## 9. Build Order (smallest-first, to de-risk the proof)

1. Ship + vertical auto-scroll + Pilot movement on the shared screen.
2. Gunner aim/fire + drones + **Heat/overheat**.
3. Spotter phone station: pan + tap-tag + **COOL IT DOWN!** rapid-tap.
   → *At this point we can already test the hero beat (Proof #3).*
4. Cages + green-tag rescue + menagerie (Proof #5).
5. Hull + breaches + **PATCH!** (Proof #4).
6. **Down & Rally** — CRITICAL-hull down state + **SAVE [name]!** rapid-tap revive
   + graceful fail (Proof #7).
7. The Warden boss (the all-roles climax, with down → rally under fire).
8. Extract + Results + PR/Family-PR + fun facts (Proof #6).

Steps 1–3 alone validate the riskiest, most important claim. Everything after
deepens it into a full level.
