# TJC: Family Adventures — Game Design Brief

> The source of truth for the game's design. Technology and engine choices come
> *after* the design is settled, so the tools serve the game rather than shape it.

---

## 1. North Star

**One vessel, many hands.** A cooperative game where a parent and kids of very
different ages all play *the same run at the same time*, each with a real and
different job matched to their ability — and the vessel only succeeds when they
work together.

The test for every decision: *does this make all players feel essential at
once?* If the youngest is just watching, or the oldest is just carrying, it's
wrong.

---

## 2. Why It's Special

Most "family games" force a compromise: either the little kid is bored, the
grown-up is bored, or the little one just watches the big one play. This game
refuses that compromise — three people, three abilities, one shared machine,
everyone necessary.

And it **grows with the child**: the same kid plays for years, climbing through
control complexity as they're ready.

---

## 3. Design Pillars

1. **One shared vessel, many roles.** Everyone is on the same machine.
   Interdependence is the point — including direct **cross-member assists** where
   one player rescues another in real time (§8).
2. **Age-matched controls.** Three complexity tiers so no player is bored or
   overwhelmed. Difficulty scales to the pilot/gunner; the youngest is always
   *additive*, never the reason the team fails.
3. **Mechanics outlive theme.** Roles are abstract contracts. Reskin the world
   (spaceship → tank → race → side-scroller) without rewriting the roles.
4. **Profiles travel.** Your identity, role, tier, animals, and unlocks follow
   you to whatever device you grab.
5. **Cooperative first, friction designed-for.** Siblings *will* compete and
   fight over devices — fairness and rotation are built in.

---

## 4. The Crew

| Player | Age | Starting role | Why |
|---|---|---|---|
| Dad | grown-up | **Pilot**, Tier 3 | Spatial planning, resource juggling, keeps everyone alive |
| Junie | 9 | **Gunner**, Tier 2 | Aiming, prioritizing, loadout decisions, upgrades |
| Cloe | 6 | **Spotter**, Tier 1 | Tap/swipe delight, marking targets, popping shinies |

Roles and tiers are **independent and swappable** — a player can be a Tier-1
Gunner or a Tier-3 Spotter. These are starting assignments, not fixed.

---

## 5. The Three Roles

Each role is a theme-independent **contract** — the *job*, not the dressing.
Worlds change the art and physics; the contracts never change.

### Pilot — "move the machine"
*Load: spatial reasoning, planning ahead, resource management.*
- **NAVIGATE** the vessel, **DODGE** hazards, **ROUTE** through the level,
  **POSITION** for the gunner, **MANAGE** the boost/power.
- *Feel:* the engine. Without you nothing moves. You enable everyone.

### Gunner — "win the fight"
*Load: targeting, prioritization, light strategy, economy.*
- **AIM** & **FIRE**, **SWITCH** weapons, **PRIORITIZE** threats, **UPGRADE**
  (spend salvage; pre-run **loadout builder**).
- *Feel:* the firepower and the combat decision-maker.

### Spotter — "see and disrupt"
*Load: minimal — reaction, recognition, delight.*
- **TAG** targets — green = *rescue a friend*, red = *destroy* (the Spotter's
  core verb), **POP** powerups, **PAN/ZOOM** to explore, **ASSIST** the crew in a
  crisis (§8).
- *Feel:* pure joy, juicy feedback, hard to fail, visibly helps the team.

---

## 6. Complexity Tiers (the progression)

Each role has a three-tier ladder. **A player climbs the ladder as they grow** —
that's the core progression.

**Spotter** — T1: tap to tag, pop powerups, swipe to look around, mash the
cooldown assist (no fail state). · T2: choose tag *type*, pinch-zoom for hidden
things, limited "boom" charges, timing-based assists. · T3: paint targets for
guided weapons, call out hazards, run radar/minimap, proactively manage venting.

**Gunner** — T1: tap to shoot, one weapon, generous auto-aim. · T2: precise aim,
2–3 weapons, heat/cooldowns, spend salvage, simple loadouts. · T3: full loadout
builder, ammo economy, weapon synergies, manual priority targeting.

**Pilot** — T1: steer with heavy assists, avoid big obstacles. · T2: free
navigation, dodge, manage one resource. · T3: full flight model, route puzzles,
positioning, hazard sequencing.

> **Design rule:** difficulty scales with the **pilot/gunner** tier; the
> **spotter is always additive**. The youngest's presence only ever *helps* — its
> absence never hard-fails the team.

---

## 7. The Shared Vessel

Everyone draws from **one set of shared resources** — this is what turns three
people playing near each other into three people playing *together*.

- **Hull / Health** *(v1)* — shared ship integrity. When Hull is depleted, a
  decisive hit **downs a crew member** (their station goes offline) rather than
  instantly ending the run — the family can **rally to revive** them (§8). The run
  ends only if the **whole crew is down at once**. (A graceful fail-state: you go
  down and get saved, you don't just "lose.")
- **Heat** *(v1)* — fire too much and weapons overheat and lock out. More than a
  limiter: it's a **collaboration hook** another player resolves (§8).
- **Power / Energy** *(future)* — a single shared budget for moving, firing, and
  scanning, forcing real-time negotiation ("quit boosting, I need to fire!").
  Each role has its own energy until this layer is added.

---

## 8. Cross-Member Collaboration (Assist Hooks)

**Assist hooks** are real-time moments where *one player's input rescues or
amplifies another's*. This is where "playing near each other" becomes "playing
together," and it's the most exciting thing in the design.

### The signature beat: Overheat → Cooldown
The Gunner fires hard and the weapon **overheats and locks**. A big **COOL IT
DOWN!** prompt fires on the Spotter's screen; she **rapid-taps** to vent the heat
and bring the weapon back online — fast, frantic, heroic. The Gunner literally
can't keep firing through a heavy fight without the Spotter in the clutch
moments. *The youngest becomes the hero — the whole north star in one beat.*

It works because rapid-tap is perfect for a 5–6-year-old (pure energy, tiny skill
ceiling, huge impact), it's **rescue not punishment** (overheat is a rhythm:
fire → overheat → saved → fire again), and it converts rivalry into teamwork in
real time.

### The v1 assists — two kinds
**System assists** — fix a failing system:
1. **Overheat → cooldown** — Spotter rapid-taps to cool the Gunner's weapon.
2. **Hull breach → patch** — Spotter taps to seal a breach and save the Pilot.

**Crew rally** — save a *person* (the emotional peak):
3. **Rally to Revive** — if a crew member is **downed** (their station knocked
   offline by a heavy hit), a big **SAVE [name]!** prompt fires for *everyone
   else*, who **rapid-tap together** to bring them back. More hands = faster
   revival; while a member is down the crew is a station short, so the call is
   urgent and loud — *"drop everything, save Cloe!"* The whole family rallies for
   one of its own, and it doubles as the game's graceful **fail-state** (§7).

Anyone can be the one rallied or do the rallying — so the youngest is clutch for
both teammates *and* part of every rescue of *them*.

### The pattern (later additions)
The hook generalizes — help can flow in every direction across all roles, and
each reskins across worlds (a tank turret overheats, a race engine redlines):
charged-shot **feed**, **boost spin-up**, power **hold-fire**, etc. Assists also
**tier up** (T1 mash → T2 timing/sweet-zone → T3 proactively manage the system).

---

## 9. Crew Size & Scaling

**Co-op only: 2–3 real humans, no AI seats and no doubled-up stations.** Each
human plays exactly one role.

The minimum crew is **Pilot + Gunner** (the core combat loop); the **Spotter is
the additive third seat**. From this comes the scaling rule:

> **Mechanics that need a dedicated human to manage them are active only when
> that human is present.** With fewer players they are **disabled**, not
> automated. With no Spotter, there is **no overheat, no hull-patch, and no manual
> tagging** — the run is simply a leaner experience. With all three roles filled,
> the full game is on.

---

## 10. The Mission Loop

A **run** is one level shaped as setup → escalation → climax → extract:

1. **TRAVERSE** a hostile area — the pilot drives forward progress.
2. **DESTROY / NEUTRALIZE** invaders — gunner fires, spotter marks.
3. **COLLECT** resources & powerups — anyone; easy and joyful for the youngest.
4. **SURVIVE** hazards — pilot dodges, spotter warns.
5. **CLIMAX** — reach an objective / beat a boss that *requires all roles*.
6. **EXTRACT** — escape under pressure for a final beat of tension.

Between runs: a **prep / loadout stage** (mostly the Gunner's playground) and a
**lobby** (claim seats, rotate roles, spend rewards).

---

## 11. Tone & Story

Playful, not grim. **Rescue-led:**

- **Goal:** invaders (cartoonish **robots / goo**) have overrun a friendly world
  and trapped its animals. Fly in, blast the invaders, **free the captives**, and
  **extract** them. No civilians, no "enemy city" — destruction stays guilt-free.
- **TAG has meaning:** green = rescue/beam up a friend, red = destroy.
- **Climax:** beat the boss holding the captured animals, grab them, run.

### The animals you rescue are the crew's own favorites
During profile setup each player picks a **handful of favorite animals**; those
exact animals are the captives found throughout the game.
- **Personal stakes for every kid** — *"There's MY sloth — save it!"*
- The rescuable critters in a run are the **union of the crew's picks**.
- **Rarer animals are worth more, and each has a personality that drives its
  rescue** — common **bunnies** score least (but come in bunches); the **fox**
  bolts if you're too slow; the **sloth** is a slow beam-up you must *protect*;
  and the **cheetah** is worth the most — it's so fast you have to tag it before
  it streaks off. A light prioritization layer. *(v1 roster: bunnies, fox, sloth,
  cheetah.)*
- **Menagerie:** rescued animals join a profile **collection/gallery** (and may
  ride along as ship mascots) — a gentle, positive "save 'em all" hook.

Aesthetic: **pixel art, 8-bit style.**

---

## 12. Profiles, Screens & Seating

- **Profile** = avatar, name, role + tier, **favorite animals**, unlocks,
  cosmetics, **menagerie**, and progress. Pick your profile on any device and the
  controls auto-configure to your tier.
- **Device affinity (natural, not forced):** phone → Spotter, laptop →
  Pilot/Gunner. The profile carries *who you are* regardless of device.
- **Screens:** the **laptop is the shared "table"** — the canonical view of the
  vessel and world everyone watches together. Each phone is a **role-tailored
  station**, not a full mirror (Spotter: pannable mini-view + TAG and COOL-IT
  buttons; Gunner on a device: aim reticle + weapon switch). Shared attention,
  role-specific controls.
- **Seating & fairness:** a **lobby / seat-claim** screen before each run,
  **role rotation** between runs so everyone gets a turn at the "fun" seat, and a
  fairness tracker ("Cloe gets the phone next run").

---

## 13. Scoring & Progress

Scoring kills toxic comparison and fuels motivation: **no player is ever ranked
against another — you only race your own last run.**

- **Personal Records:** end of level shows each player's score vs. their own PR
  — a bar filling past last time's line; beat it → "**NEW BEST!**"
- **Family PR:** a combined crew score, tracked **per-world and per-level**, that
  rewards cooperation — and only climbs through the assist hooks (§8).
- **Tier-up = fresh PR track.** Old-tier bests are archived as trophies (🏅),
  never erased; you don't have to beat an easy-mode score on harder controls.
- **Per-role metrics** so a PR means something — Pilot: clean dodges, hull
  preserved, route efficiency. Gunner: accuracy, targets downed, salvage.
  Spotter: animals tagged, powerups popped, **clutch assists delivered**. Family:
  objective %, hull remaining, assist/combo chains, time.
- **End-of-run "fun facts"** (non-ranked, celebratory): *"⭐ Cloe rescued all her
  animals!" · "⭐ Junie — new accuracy best: 71%" · "⭐ Dad — clean run, 0 hull
  lost."* Everybody gets a moment; nobody loses.
- **Intimate by design** — compare to *your* history and *your* family, not
  global leaderboards.

---

## 14. Worlds (reskins)

Each world maps the *same three role contracts and assist hooks* onto themed art
and physics. Start with **one world done well**; later worlds validate the
abstraction.

1. **Sky Raid (spaceship)** — top-down/iso, fly over a world. *The first world.*
2. **Tank Squad** — ground vehicle; pilot drives, gunner mans the turret, spotter
   pops the hatch / flies a drone. (Turret overheats → cool it.)
3. **Death Race** — racing + combat; pilot drives, gunner shoots rivals &
   obstacles, spotter grabs boosts and marks shortcuts. (Engine redlines.)
4. **Side-Scroller** — a walking mech or ship, left-to-right; same three roles.
5. *(future)* submarine, dragon/mount, mech, and themed framings (e.g. "cleanup"
   a goo-flooded planet, "heroic raid" against an invader armada).

---

## 15. Future Depth (deferred, post-v1)

- **Shared Power budget** negotiation (§7).
- **More assist hooks** — feed the big shot, boost spin-up, power hold-fire, plus
  cross-pairs beyond the Spotter (§8).
- **More worlds** (§14) and **higher complexity tiers / deeper loadouts** (§6).
- **2-player edge configs** — refine the no-Pilot / no-Gunner cases beyond the
  baseline disable-when-absent rule (§9).
