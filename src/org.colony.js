const Room = require('./org.room');
const OrgBase = require('./org.base');
const Observer = require('./org.observer');
const Topics = require('./lib.topics');
const PID = require('./lib.pid');
const {doEvery} = require('./lib.scheduler');

const MEMORY = require('./constants.memory');
const WORKERS = require('./constants.creeps');
const TASKS = require('./constants.tasks');
const TOPICS = require('./constants.topics');
const PRIORITIES = require('./constants.priorities');
const {creepIsFresh} = require('./behavior.commute');

const {MEMORY_ASSIGN_ROOM, MEMORY_ROLE, MEMORY_COLONY} = require('./constants.memory');
const {TOPIC_SPAWN, TOPIC_DEFENDERS, TOPIC_HAUL_TASK} = require('./constants.topics');
const {WORKER_RESERVER, WORKER_DEFENDER} = require('./constants.creeps');
const {PRIORITY_CLAIMER, PRIORITY_DEFENDER, PRIORITY_HAULER} = require('./constants.priorities');


const MAX_DEFENDERS = 3;
const MAX_EXPLORERS = 1;

const UPDATE_ROOM_TTL = 1;
const UPDATE_CREEPS_TTL = 1;
const UPDATE_HAULERS_TTL = 5;

const REQUEST_MISSING_ROOMS_TTL = 50;
const REQUEST_HAULER_TTL = 20;
const REQUEST_DEFENDER_TTL = 25;
const REQUEST_EXPLORER_TTL = 3000;

class Colony extends OrgBase {
  constructor(parent, colony, trace) {
    super(parent, colony.id, trace);

    const setupTrace = this.trace.begin('constructor');

    this.topics = new Topics();

    this.primaryRoomId = colony.primary;
    this.desiredRooms = colony.rooms;
    this.primaryRoom = Game.rooms[this.primaryRoomId];


    this.pidDesiredHaulers = 0;
    if (this.primaryRoom) {
      PID.setup(this.primaryRoom.memory, MEMORY.PID_PREFIX_HAULERS, 0, 0.4, 0.0005, 0);
    }

    this.roomMap = {};
    this.primaryOrgRoom = null;
    this.observer = null;
    this.doUpdateOrg = doEvery(UPDATE_ROOM_TTL)((trace) => {
      this.updateOrg(trace);
    });

    this.assignedCreeps = [];
    this.defenders = [];
    this.numCreeps = 0;
    this.doUpdateCreeps = doEvery(UPDATE_CREEPS_TTL)(() => {
      this.assignedCreeps = this.getParent().getCreeps().filter((creep) => {
        return creep.memory[MEMORY.MEMORY_COLONY] === this.id;
      });
      this.numCreeps = this.assignedCreeps.length;

      this.defenders = this.assignedCreeps.filter((creep) => {
        return creep.memory[MEMORY_ROLE] == WORKER_DEFENDER &&
          creep.memory[MEMORY_COLONY] === this.id;
      });
    });

    this.haulers = [];
    this.numHaulers = 0;
    this.numActiveHaulers = 0;
    this.idleHaulers = 0;
    this.avgHaulerCapacity = 300;
    this.doUpdateHaulers = doEvery(UPDATE_HAULERS_TTL)(() => {
      this.haulers = this.assignedCreeps.filter((creep) => {
        return creep.memory[MEMORY_ROLE] === WORKERS.WORKER_HAULER &&
          creep.memory[MEMORY_COLONY] === this.id &&
          creepIsFresh(creep);
      });

      this.numHaulers = this.haulers.length;

      this.numActiveHaulers = this.haulers.filter((creep) => {
        const task = creep.memory[MEMORY.MEMORY_TASK_TYPE];
        return task === TASKS.TASK_HAUL;
      }).length;

      this.idleHaulers = this.numHaulers - this.numActiveHaulers;

      // Updating the avg when there are no haulers causes some undesirable
      // situations (task explosion)
      if (this.numHaulers) {
        this.avgHaulerCapacity = this.haulers.reduce((total, hauler) => {
          return total + hauler.store.getCapacity();
        }, 0) / this.haulers.length;

        if (this.avgHaulerCapacity < 300) {
          this.avgHaulerCapacity = 300;
        }
      }
    });

    this.doHandleDefenderRequest = doEvery(REQUEST_DEFENDER_TTL)(() => {
      // Check intra-colony requests for defenders
      const request = this.getNextRequest(TOPIC_DEFENDERS);
      if (request) {
        this.handleDefenderRequest(request);
      }
    });

    this.doRequestReserversForMissingRooms = doEvery(REQUEST_MISSING_ROOMS_TTL)(() => {
      this.requestReserverForMissingRooms();
    });

    this.doRequestHaulers = doEvery(REQUEST_HAULER_TTL)(() => {
      // console.log("do hauler request", this.id)
      this.requestHaulers();
    });

    setupTrace.end();
  }
  update(trace) {
    const updateTrace = trace.begin('update');

    this.topics.removeStale();

    // console.log(JSON.stringify(this.topics));

    // console.log("topics", this.id, JSON.stringify(this.topics))

    this.primaryRoom = Game.rooms[this.primaryRoomId];

    this.doUpdateOrg(updateTrace);
    this.doUpdateCreeps();
    this.doUpdateHaulers();

    // Fraction of num haul tasks
    let numHaulTasks = this.getTopicLength(TOPIC_HAUL_TASK);
    numHaulTasks -= this.idleHaulers;

    if (this.primaryRoom) {
      this.pidDesiredHaulers = PID.update(this.primaryRoom.memory, MEMORY.PID_PREFIX_HAULERS,
        numHaulTasks, Game.time);
    }

    console.log(this);

    const roomTrace = updateTrace.begin('rooms');
    Object.values(this.roomMap).forEach((room) => {
      room.update(roomTrace);
    });
    roomTrace.end();

    if (this.observer) {
      this.observer.update(updateTrace);
    }

    this.doRequestReserversForMissingRooms();
    this.doHandleDefenderRequest();

    if (this.primaryOrgRoom && this.primaryOrgRoom.hasStorage) {
      this.doRequestHaulers();
    }

    // if (this.doRequestExplorer) {
    //  this.doRequestExplorer();
    // }

    updateTrace.end();
  }
  process(trace) {
    const processTrace = trace.begin('process');

    this.updateStats();

    const roomTrace = processTrace.begin('rooms');
    Object.values(this.roomMap).forEach((room) => {
      room.process(roomTrace);
    });
    roomTrace.end();

    if (this.observer) {
      this.observer.process(processTrace);
    }

    processTrace.end();
  }
  toString() {
    const topics = this.topics.getCounts();

    return `* Colony - ID: ${this.id}, #Rooms: ${Object.keys(this.roomMap).length}, ` +
      `#Missing: ${this.missingRooms.length}, ` +
      `#Creeps: ${this.numCreeps}, ` +
      `#Haulers: ${this.numHaulers}, ` +
      `#HaulTasks: ${topics[TOPICS.TOPIC_HAUL_TASK] || 0}, ` +
      `AvgHaulerCapacity: ${this.avgHaulerCapacity}, ` +
      `#Defenders: ${this.defenders.length}`;
  }
  getColony() {
    return this;
  }
  getRoom() {
    throw new Error('a colony is not a room');
  }
  getPrimaryRoom() {
    return this.primaryOrgRoom;
  }
  getRoomByID(roomId) {
    return this.roomMap[roomId] || null;
  }
  getCreeps() {
    return this.assignedCreeps;
  }
  getHaulers() {
    return this.haulers;
  }
  sendRequest(topic, priority, request, ttl) {
    this.topics.addRequest(topic, priority, request, ttl);
  }
  getNextRequest(topic) {
    return this.topics.getNextRequest(topic);
  }
  peekNextRequest(topic) {
    return this.topics.peekNextRequest(topic);
  }
  getTopicLength(topic) {
    return this.topics.getLength(topic);
  }
  getTopics() {
    return this.topics;
  }
  getReserveStructures() {
    if (!this.primaryRoom) {
      return [];
    }

    return this.primaryRoom.getReserveStructures();
  }
  getReserveResources(includeTerminal) {
    if (!this.primaryOrgRoom) {
      return {};
    }

    return this.primaryOrgRoom.getReserveResources(includeTerminal);
  }
  getAmountInReserve(resource, includeTerminal) {
    if (!this.primaryOrgRoom) {
      return 0;
    }

    return this.primaryOrgRoom.getAmountInReserve(resource, includeTerminal);
  }
  getReserveStructureWithMostOfAResource(resource) {
    if (!this.primaryOrgRoom) {
      return null;
    }

    return this.primaryOrgRoom.getReserveStructureWithMostOfAResource(resource);
  }
  getStructureWithMostOfAResource(resource) {
    if (!this.primaryOrgRoom) {
      return null;
    }

    return this.primaryOrgRoom.getStructureWithMostOfAResource(resource);
  }
  getReserveStructureWithRoomForResource(resource) {
    if (!this.primaryOrgRoom) {
      return null;
    }

    return this.primaryOrgRoom.getReserveStructureWithRoomForResource(resource);
  }
  getAvgHaulerCapacity() {
    return this.avgHaulerCapacity;
  }
  updateStats() {
    const topicCounts = this.topics.getCounts();

    const colonyStats = {
      numHaulers: this.numHaulers,
      haulTasks: (topicCounts[TOPICS.TOPIC_HAUL_TASK] || 0) - this.idleHaulers,
      haulerSetpoint: this.haulerSetpoint,
      pidDesiredHaulers: this.pidDesiredHaulers,
      rooms: {},
      booster: {},
      spawner: {},
      topics: topicCounts,
    };

    const stats = this.getStats();
    stats.colonies[this.id] = colonyStats;
  }
  handleDefenderRequest(request) {
    console.log('DEFENDER REQUEST', JSON.stringify(request));

    const neededDefenders = MAX_DEFENDERS - this.defenders.length;
    if (neededDefenders > 0) {
      // If the colony has spawners and is of sufficient size spawn own defenders,
      // otherwise ask for help from other colonies
      if (this.primaryOrgRoom && this.primaryOrgRoom.hasSpawns &&
        (this.primaryRoom && this.primaryRoom.controller.level > 3)) {
        this.sendRequest(TOPIC_SPAWN, PRIORITY_DEFENDER, request.details, REQUEST_DEFENDER_TTL);
      } else {
        request.details.memory[MEMORY.MEMORY_COLONY] = this.id;
        this.getKingdom().sendRequest(TOPIC_SPAWN, PRIORITY_DEFENDER, request.details, REQUEST_DEFENDER_TTL);
      }
    }

    // Order existing defenders to the room
    this.defenders.forEach((defender) => {
      defender.memory[MEMORY.MEMORY_ASSIGN_ROOM] = request.details.memory[MEMORY.MEMORY_ASSIGN_ROOM];
      defender.memory[MEMORY.MEMORY_ASSIGN_ROOM_POS] = request.details.memory[MEMORY.MEMORY_ASSIGN_ROOM_POS];
    });
  }
  requestHaulers() {
    if (this.primaryRoom) {
      // PID approach
      if (this.numHaulers < this.pidDesiredHaulers) {
        this.sendRequest(TOPIC_SPAWN, PRIORITY_HAULER, {
          role: WORKERS.WORKER_HAULER,
          memory: {},
        }, REQUEST_HAULER_TTL);
      }
    }
  }
  requestExplorer() {
    if (!this.primaryRoom) {
      return;
    }

    const numExplorers = this.assignedCreeps.filter((creep) => {
      return creep.memory[MEMORY_ROLE] == WORKERS.WORKER_EXPLORER &&
        creep.memory[MEMORY_COLONY] === this.id;
    });

    if (numExplorers < MAX_EXPLORERS) {
      this.sendRequest(TOPIC_SPAWN, PRIORITIES.EXPLORER, {
        role: WORKERS.WORKER_EXPLORER,
        memory: {},
      }, REQUEST_EXPLORER_TTL);
    }
  }
  requestReserverForMissingRooms() {
    this.missingRooms.forEach((roomID) => {
      const numReservers = this.assignedCreeps.filter((creep) => {
        return creep.memory[MEMORY_ROLE] == WORKERS.WORKER_RESERVER &&
          creep.memory[MEMORY_ASSIGN_ROOM] === roomID;
      }).length;

      // A reserver is already assigned, don't send more
      if (numReservers) {
        return;
      }

      if (this.primaryOrgRoom && this.primaryOrgRoom.hasSpawns) {
        this.sendRequest(TOPIC_SPAWN, PRIORITY_CLAIMER, {
          role: WORKER_RESERVER,
          memory: {
            [MEMORY_ASSIGN_ROOM]: roomID,
          },
        }, REQUEST_MISSING_ROOMS_TTL);
      } else {
        // Bootstrapping a new colony requires another colony sending
        // creeps to claim and build a spawner
        this.getKingdom().sendRequest(TOPIC_SPAWN, PRIORITY_CLAIMER, {
          role: WORKER_RESERVER,
          memory: {
            [MEMORY_ASSIGN_ROOM]: roomID,
            [MEMORY.MEMORY_COLONY]: this.id,
          },
        }, REQUEST_MISSING_ROOMS_TTL);
      }
    });
  }
  updateOrg(trace) {
    const updateOrgTrace = trace.begin('update_org');

    this.visibleRooms = Object.keys(Game.rooms);
    this.missingRooms = _.difference(this.desiredRooms, this.visibleRooms);
    this.colonyRooms = _.difference(this.desiredRooms, this.missingRooms);

    // Rooms
    const desiredRoomIds = this.desiredRooms;
    const orgRoomIds = Object.keys(this.roomMap);

    const missingOrgColonyIds = _.difference(desiredRoomIds, orgRoomIds);
    missingOrgColonyIds.forEach((id) => {
      const room = Game.rooms[id];
      if (!room) {
        return;
      }

      const orgNode = new Room(this, room, trace);
      this.roomMap[id] = orgNode;
      this.getKingdom().roomNameToOrgRoom[id] = orgNode;
    });

    const extraOrgColonyIds = _.difference(orgRoomIds, desiredRoomIds);
    extraOrgColonyIds.forEach((id) => {
      delete this.roomMap[id];
      delete this.getKingdom().roomNameToOrgRoom[id];
    });

    this.primaryOrgRoom = this.roomMap[this.primaryRoomId];

    if (this.primaryRoom && this.primaryRoom.controller.level === 8) {
      if (!this.observer) {
        const observerStructures = this.primaryRoom.find(FIND_MY_STRUCTURES, {
          filter: (structure) => {
            return structure.structureType === STRUCTURE_OBSERVER;
          },
        });

        if (observerStructures.length) {
          this.observer = new Observer(this, observerStructures[0], trace);
        }
      }
    } else if (this.primaryRoom) {
      // this.doRequestExplorer = doEvery(REQUEST_EXPLORER_TTL,
      //  this.primaryRoom.memory, 'request_explorer')(() => {
      //    this.requestExplorer();
      //  });
    }

    updateOrgTrace.end();
  }
}

module.exports = Colony;