# Screeps AI

An AI for [Screeps](screeps.com).

* [Game Docs](https://docs.screeps.com)
* [API Docs](https://docs.screeps.com/api)

#### Key Features:

* Creep logic implemented using Behavior Trees (BT)
* Tracing (metrics, logging) and Feature Flag logic to aid development/debugging
* Remote harvesting/mining
* Miners w/ container and haulers
* Buy/sell minerals
* React and distribute compounds with a focus on "upgrade" boost
* Explore rooms and store notes in memory
* Haulers managed by PID controller
* Scheduler & Processes
* Message bus w/ topics for IPC
* Event streams
* Automatic expansion and base building
* HUD

#### Roadmap:

- [x] Sustainably upgrade RCL in tutorial room
- [x] Scale creep parts based on room capacity
- [x] Organize logic and fix how builders and repairers source their energy
- [x] Implement behavior tree
- [x] Migrate creep roles to behavior tree
- [x] Storage construction triggers Distributors and prioritized Storage usage
- [x] Attack flag
- [x] Refactor movement and storage selection (more hauling with fewer Distributors)
- [x] Kingdom refactor
- [x] Refactor creep manager
- [x] Track time between end and start of spawns and increase/decrease min energy (Spawn Time Governor)
- [x] Auto-defence of owned rooms
- [x] Scale number of repairers based on repair needs of the room
- [x] Scale number of builders based on number of construction sites in room
- [x] Scale number of haulers based on fullness/rate of harvesting
- [x] Refactor and support multiple spawners in room
- [x] Auto-manage Upgraders per spawn (maximize what the economy can support - net zero energy)
- [x] Auto return-to-home and defense of remote harvesters
- [x] Don't require Build flags, staff rooms w/ construction sites, use flags to prioritize nearby sites
- [x] Refactor role and spawn logic to support easy addition of creep roles
- [x] Implement Scheduler, Process, and other OS components
- [x] Move Creeps to scheduler
- [x] Auto attack of weaker players
- [x] Intra-shared movement and claiming
- [X] Proper event stream
- [X] Auto-construction of roads to remote sources
- [X] Automatic layout and expansion
- [X] System for a Room and Map(beta) HUD
- [x] Remove "org" model
  - [ ] Room
    - [ ] Move hostile tracking (deleted logic)
    - [ ] Move defense
    - [x] Move tracking of damaged creeps
    - [x] Move structure repairing
    - [ ] Move sharing of boost details
    - [ ] Move resource tracking
  - [x] Observer (move into Base Observer)
  - [x] Colony
  - [x] Kingdom
    - [x] Use AI for accessing topics, planner, scheduler, etc...
    - [x] Move path cache, cost matrix cache, and resource gov. to AI
  - [x] Refactor Resource Governor into a Process
    - [x] Move to TypeScript
- [x] Replace references to 'colony' with 'base'
- [ ] Refactor thread API
  - [ ] Strongly typed thread API
  - [ ] Automatically run threads and sleep main process correct amount of time
- [ ] Double buffer topics when TTLing messages
- [x] All of project on TypeScript
- [ ] Fix restoring of Room Entries and War Manager targets on restart with Persistent Memory
- [ ] Refactor PID controller
- [ ] Influence map library
- [ ] Move creep definitions into individual creep files
- [ ] TD: Room process and sources processes no longer require room visibility
- [ ] TD: Replace spawn topics (TTL) with event streams (manages own queue)
- [ ] TD: Cleanup old construction sites automatically
- [ ] Scale creep parts and remote mining based on spawner saturation
- [ ] Harvest commodities & factory
- [ ] Process stats and scheduler report
- [ ] Factor room resources when selecting new base
- [ ] Sieging of RCL>=7 rooms
- [ ] Quads moving coherently 100% of time
- [ ] Buff ramparts and walls to withstand nuke
- [ ] Move all data sharing between processes to topics/IPC (remove direct access)
- [ ] Improved defenders that hide in ramparts
- [ ] Collect Power
- [ ] Create & drive Power Creeps
- [ ] Apply buffer to lvl 8 rooms
- [ ] Allow buffer manager to nuke and time sending attackers
- [ ] Police portal rooms
- [ ] Attack other players getting commodities/power


## Setup

> Backup your existing scripts.

> Note this project uses LF, not CRLF, and the linter will complain if it files with CRLFs.
> The project is setup for [EditorConfig](https://editorconfig.org/). Please use that.

Requirements:
  * Node 16+

```
npm install grunt-cli -g
npm install
```

Create `.screeps.json` and provide credentials:
```
{
  "email": "<email>",
  "token": "<token>",
  "branch": "default",
  "ptr": false,
  "private": {
    "username": "<username>",
    "password": "<password>",
    "branch": "default",
    "ptr": false
  }
}
```

> Token is gotten from the the account settings in the Screeps client. The private username and password for private servers are set via the private server CLI tool.

## Running

After making changes run linting, tests, and TS complication with `grunt`.

Uploading of built TS+JS can be done by running `grunt <world>` where `<world>` can be `mmo`, `private`, or `local`.

## Structure

> Screeps does not allow the uploading of source maps. So, to keep the stack traces from the game similar to the
source good the directory has a flat structure and is not combined into single JS file. This may change in the future depending on the pain.

The source is prefixed to group files by their type/purpose:
- AI - The core/kernel of the bot
- Behavior - Files containing behavior trees for creeps
- Constants - Shared constants
- Lib - Shared libraries and tools
- OS - Scheduler, Process, and other OS-level components
- Roles - Behavior trees for Creep roles
- Runnable - AI processes and threads that perform the majority of work in the bot

First-class business logic concepts:
- AI - Root object for the AI
- Scribe - Aggregates game state and persists room details in case the we lose visibility
- Caches - Cost Matrices and Path
- Scheduler - Tracks, schedules, and execute processes
- Process - A runnable unit for work, wrapper for AI logic run during a tick
- Topics - Priority queues organized into topics
- Event Streams - Event streams and consumer groups
- Tracer - Logging, tracing, and metrics

The AI strategy is contained mostly in the Runnables and the Roles, which will sure the shared constants, functions, and libraries.

Communication between processes and other components is almost entirely done over Topics and Event Streams, items not using these methods are being moved to using them as needed.

## Operation

The AI will focus on establishing an economy, build, repair, and defend it's bases. The build manager will spawn at least one Upgrader and will add more if there is energy above the defense reserve.

There are some debugging tools built into the project:

* Run and draw path - `AI.getPathDebugger().debug(new RoomPosition(11, 12, 'W8N4'), new RoomPosition(25,25,'W7N6'), 1, 'warparty')`
* Clear path - `AI.getPathDebugger().clear()`
* Run and draw cost matrix - `AI.getCostMatrixDebugger().debug("W8N4", 'open_space')`
* Cost matrix clear - `AI.getCostMatrixDebugger().clear()`
* Get debug info on path cache - `AI.kingdom.getPathCache().debug()`
* Attack a room (requires rally_<room> flag) - `AI.getTopics().addRequestV2('attack_room', {priority: 1, details: {status: "requested", roomId: "E58N42"}, ttl: 100})`
* Look at central planning results - `AI.getPlannerDebugger().debug()`
* Look at min cut output - `AI.getMinCutDebugger().debug(AI.getKingdom(), 'W6N1')`
* Get cached room details from Scribe - `JSON.stringify(AI.getKingdom().getScribe().getRoomById('W8N4'))`
* Launch Nuke - `AI.kingdom.sendRequest('nuker_targets', 1, {position: '28,35,E19S49'}, 100)`


```
// Example of converting old base to being automated
AI.getKingdom().getPlanner().baseConfigs['E22S49'].origin = new RoomPosition(42,16,'E22S49')
AI.getKingdom().getPlanner().baseConfigs['E22S49'].automated = true
```

There are a couple of helpful global variables:

> Many of these persist between restarts, so make sure to unset them when you're finished with them.

* `METRIC_REPORT=true|false` - Will output aggregated tracing metric data to the console
* `METRIC_CONSOLE=true|false` - Will output tracing metric data to the console
* `METRIC_FILTER=<prefix>|null` - Will cause Tracer to report metrics for metrics that start with `<prefix>`
* `METRIC_MIN=<min ms>|0` - (default 0.5ms) Will cause Tracer to report metrics that are greater than `<min ms>`
* `LOG_WHEN_PID='<prefix>'|null` - Logs with tracers matching the prefix will be output to the console
* `RESET_PIDS=true|false` - Will reset the PID controllers - useful when PID controllers are spawning too many haulers

## Strategy

### Central Planning

### Base

The `./src/main.ts` file contains a `KingdomConfig` that defines the rooms that should be considered part of the Kingdom. Rooms inside the Kingdom will be reserved/claimed in the order they appear in the list. Sources present in the Kingdom's Domain will be harvested.

> Make sure to update the list when setting up the project

### Build priorities

### Economy & Market

### Defense

### Offense

### Creeps

* Attacker - Rally at Attack Flag and attack hostiles in room
* Builder - Harvest/pick up energy in room and completes construction
* Defender - Attacks hostiles creeps in room
* Defender Drone -
* Distributor - Moves energy from Containers/Storage into Spawner, Turrets, Labs, and other base core structures
* Explorer - Goes to rooms in domain to get visibility (triggers remote harvesting)
* Harvester - Harvests and brings energy back to Spawner/Origin
* Hauler - Picks up and takes energy in containers to base storage, also picks up dropped resources
* Miner - Harvests and places energy in nearby container
* Repairer - Harvest/pick up energy in room and repair structures
* Reserver - Claims/Reserves rooms
* Upgrader - Upgrades room controllers

#### Parties

Groups of creeps, typically called a quad, are represented by a single party, which is a process that assigns member creeps move, attack, and heal orders. Parties are created by a manager process, see `runnable.manager.buffer` and `runnable.manager.war`.

