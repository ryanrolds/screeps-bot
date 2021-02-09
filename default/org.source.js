const OrgBase = require('./org.base');

const MEMORY = require('./constants.memory');
const TASKS = require('./constants.tasks');
const TOPICS = require('./constants.topics');
const CREEPS = require('./constants.creeps');
const PRIORITIES = require('./constants.priorities');
const {creepIsFresh} = require('./behavior.commute');
const featureFlags = require('./lib.feature_flags')
const {doEvery} = require('./lib.scheduler');

const REQUEST_WORKER_TTL = 25;
const REQUEST_HARVESTER_TTL = 25;
const REQUEST_HAULING_TTL = 20;

class Source extends OrgBase {
  constructor(parent, source, trace) {
    super(parent, source.id, trace);

    const setupTrace = this.trace.begin('constructor');

    this.source = source;
    this.roomID = source.room.name;

    this.container = null;
    this.containerID = null;
    this.containerUser = null;

    this.doRequestMiner = doEvery(REQUEST_WORKER_TTL)(() => {
      this.requestMiner();
    });

    this.doRequestHarvester = doEvery(REQUEST_HARVESTER_TTL)(() => {
      this.requestHarvester();
    })

    this.doRequestHauling = doEvery(REQUEST_HAULING_TTL)(() => {
      console.log("request source hauling")
      this.sendHaulTasks();
    })

    setupTrace.end();
  }
  update(trace) {

    const updateTrace = trace.begin('update')

    // was constructor
    const source = this.source = Game.getObjectById(this.id)

    const containers = source.pos.findInRange(FIND_STRUCTURES, 2, {
      filter: (structure) => {
        return structure.structureType === STRUCTURE_CONTAINER;
      },
    });

    const container = source.pos.findClosestByRange(containers);

    if (container) {
      this.container = container;
      this.containerID = container.id;
      this.containerUsed = this.container.store.getUsedCapacity();
    }

    const roomCreeps = this.getRoom().getCreeps();
    this.numHarvesters = _.filter(roomCreeps, (creep) => {
      const role = creep.memory[MEMORY.MEMORY_ROLE];
      return role === CREEPS.WORKER_HARVESTER &&
        creep.memory[MEMORY.MEMORY_HARVEST] === this.id &&
        creepIsFresh(creep);
    }).length;

    this.numMiners = _.filter(roomCreeps, (creep) => {
      const role = creep.memory[MEMORY.MEMORY_ROLE];
      return role === CREEPS.WORKER_MINER &&
        creep.memory[MEMORY.MEMORY_HARVEST] === this.id &&
        creepIsFresh(creep);
    }).length;

    const haulers = this.getColony().getHaulers();
    this.haulersWithTask = _.filter(haulers, (creep) => {
      const task = creep.memory[MEMORY.MEMORY_TASK_TYPE];
      const pickup = creep.memory[MEMORY.MEMORY_HAUL_PICKUP];
      return task === TASKS.TASK_HAUL && pickup === this.containerID;
    });

    this.avgHaulerCapacity = this.getColony().getAvgHaulerCapacity();

    this.haulerCapacity = _.reduce(this.haulersWithTask, (total, hauler) => {
      return total += hauler.store.getFreeCapacity();
    }, 0);
    // was constructor end

    //console.log(this);

    const room = this.getColony().getRoomByID(this.roomID);
    if ((room.numHostiles > 0) && !room.isPrimary) {
      // Do not request hauling or more workers if room has hostiles and is not the main room
      return;
    }

    if (!featureFlags.getFlag(featureFlags.PERSISTENT_TOPICS)) {
      this.sendHaulTasks();
    } else {
      this.doRequestHauling();
    }

    // Don't send miners or harvesters if room isn't claimed/reserved by me
    if (!room.claimedByMe && !room.reservedByMe) {
      return;
    }

    if (!featureFlags.getFlag(featureFlags.PERSISTENT_TOPICS)) {
      this.requestHarvester()
    } else {
      this.doRequestHarvester()
    }

    if (!featureFlags.getFlag(featureFlags.PERSISTENT_TOPICS)) {
      this.requestMiner()
    } else {
      this.doRequestMiner()
    }
  }
  process() {
    this.updateStats();
  }
  toString() {
    return `---- Source - ${this.id}, ` +
      `#Harvesters: ${this.numHarvesters}, ` +
      `#Miners: ${this.numMiners}, ` +
      `Container: ${this.containerID}, ` +
      `#HaulerWithTask: ${this.haulersWithTask.length}, ` +
      `SumHaulerTaskCapacity: ${this.haulerCapacity}, ` +
      `UsedCapacity: ${this.containerUsed}`;
  }
  updateStats() {
    const source = this.source;

    const stats = this.getStats();
    const sourceStats = {
      energy: source.energy,
      capacity: source.energyCapacity,
      regen: source.ticksToRegeneration,
      containerFree: (this.container != null) ? this.container.store.getFreeCapacity() : null,
    };

    stats.colonies[this.getColony().id].rooms[this.roomID].sources[this.id] = sourceStats;
  }
  sendHaulTasks() {
    if (!this.container) {
      return;
    }

    const averageLoad = this.avgHaulerCapacity || 300;
    const loadSize = _.min([averageLoad, 1000]);
    const storeCapacity = this.container.store.getCapacity();
    const storeUsedCapacity = this.container.store.getUsedCapacity();
    const untaskedUsedCapacity = storeUsedCapacity - this.haulerCapacity;
    const loadsToHaul = Math.floor(untaskedUsedCapacity / loadSize);

    //console.log("... source", this.id, this.haulersWithTask.length, loadSize, loadsToHaul,
    //  storeUsedCapacity, this.haulerCapacity, untaskedUsedCapacity)

    for (let i = 0; i < loadsToHaul; i++) {
      const loadPriority = (storeUsedCapacity - (i * loadSize)) / storeCapacity;

      const details = {
        [MEMORY.TASK_ID]: `sch-${this.id}-${Game.time}`,
        [MEMORY.MEMORY_TASK_TYPE]: TASKS.HAUL_TASK,
        [MEMORY.MEMORY_HAUL_PICKUP]: this.container.id,
        [MEMORY.MEMORY_HAUL_RESOURCE]: RESOURCE_ENERGY,
      };

      //console.log("source load", loadPriority, JSON.stringify(details))

      this.sendRequest(TOPICS.TOPIC_HAUL_TASK, loadPriority, details, REQUEST_HAULING_TTL);
    }

    const resources = Object.keys(this.container.store);
    resources.forEach((resource) => {
      if (resource !== RESOURCE_ENERGY) {
        const details = {
          [MEMORY.TASK_ID]: `scrh-${this.id}-${Game.time}`,
          [MEMORY.MEMORY_TASK_TYPE]: TASKS.HAUL_TASK,
          [MEMORY.MEMORY_HAUL_PICKUP]: this.container.id,
          [MEMORY.MEMORY_HAUL_RESOURCE]: resource,
        };

        //console.log("source load", loadPriority, JSON.stringify(details))

        this.sendRequest(TOPICS.TOPIC_HAUL_TASK, 0.5, details, REQUEST_HAULING_TTL);
      }
    });
  }
  requestHarvester() {
    let desiredHarvesters = 3;

    // If there is a container, we want a miner and a hauler
    if (this.container) {
      desiredHarvesters = 0;
    }

    if (this.source instanceof Mineral) {
      desiredHarvesters = 1;

      if (!this.source.mineralAmount) {
        desiredHarvesters = 0;
      }
    }

    if (this.numHarvesters >= desiredHarvesters) {
      return;
    }

    // As we get more harvesters, make sure other creeps get a chance to spawn
    const priority = PRIORITIES.PRIORITY_HARVESTER - (this.numHarvesters * 1.5);
    this.sendRequest(TOPICS.TOPIC_SPAWN, priority, {
      role: CREEPS.WORKER_HARVESTER,
      memory: {
        [MEMORY.MEMORY_HARVEST]: this.id, // Deprecated
        [MEMORY.MEMORY_HARVEST_ROOM]: this.roomID, // Deprecated
        [MEMORY.MEMORY_SOURCE]: this.id,
        [MEMORY.MEMORY_ASSIGN_ROOM]: this.roomID,
      },
    }, REQUEST_WORKER_TTL);
  }
  requestMiner() {
    let desiredMiners = 0;

    // If there is a container, we want a miner and a hauler
    if (this.container) {
      desiredMiners = 1;
    }

    if (this.numMiners >= desiredMiners) {
      return;
    }

    let priority = PRIORITIES.PRIORITY_MINER;
    // Energy sources in unowned rooms require half as many parts
    if (!this.source.room.controller.my) {
      priority = PRIORITIES.PRIORITY_REMOTE_MINER;
    }

    this.sendRequest(TOPICS.TOPIC_SPAWN, priority, {
      role: CREEPS.WORKER_MINER,
      memory: {
        [MEMORY.MEMORY_HARVEST]: this.id, // Deprecated
        [MEMORY.MEMORY_HARVEST_CONTAINER]: this.containerID,
        [MEMORY.MEMORY_HARVEST_ROOM]: this.roomID, // Deprecated
        [MEMORY.MEMORY_SOURCE]: this.id,
        [MEMORY.MEMORY_ASSIGN_ROOM]: this.roomID,
      },
    }, REQUEST_WORKER_TTL);
  }
}

module.exports = Source;
