import {Process, Runnable, RunnableResult, running, sleeping, terminate} from "./os.process";
import {Tracer} from './lib.tracing';
import {Kingdom} from "./org.kingdom";
import OrgRoom from "./org.room";
import * as MEMORY from "./constants.memory"
import * as TASKS from "./constants.tasks"
import * as TOPICS from "./constants.topics"
import {WORKER_HARVESTER, WORKER_MINER, WORKER_UPGRADER} from "./constants.creeps"
import {PRIORITY_HARVESTER, PRIORITY_MINER, PRIORITY_UPGRADER} from "./constants.priorities";
import * as PRIORITIES from "./constants.priorities"
import {Colony} from './org.colony';
import {thread, ThreadFunc} from "./os.thread";
import {AI} from "./lib.ai";
const {creepIsFresh} = require('./behavior.commute');

const STRUCTURE_TTL = 20;
const DROPOFF_TTL = 200;
const REQUEST_WORKER_TTL = 50;
const REQUEST_HAULING_TTL = 20;

export default class SourceRunnable {
  id: string;
  orgRoom: OrgRoom;
  sourceId: Id<Source | Mineral>;
  position: RoomPosition;
  prevTime: number;

  ttl: number;
  workerTTL: number;
  haulingTTL: number;

  containerId: Id<StructureContainer>;
  linkId: Id<StructureLink>;
  dropoffId: Id<Structure>;

  threadUpdateStructures: ThreadFunc;
  threadUpdateDropoff: ThreadFunc;
  threadRequestWorkers: ThreadFunc;
  threadRequestHauling: ThreadFunc;

  constructor(room: OrgRoom, source: (Source | Mineral)) {
    this.orgRoom = room;
    this.sourceId = source.id;
    this.position = source.pos;

    this.threadUpdateStructures = thread('update_structures', STRUCTURE_TTL)(this.updateStructures.bind(this));
    this.threadUpdateDropoff = thread('update_dropoff', DROPOFF_TTL)(this.updateDropoff.bind(this));
    this.threadRequestWorkers = thread('request_workers', REQUEST_WORKER_TTL)(this.requestWorkers.bind(this));
    this.threadRequestHauling = thread('reqeust_hauling', REQUEST_HAULING_TTL)(this.requestHauling.bind(this));
  }

  run(kingdom: Kingdom, trace: Tracer): RunnableResult {
    trace = trace.asId(this.sourceId);
    trace.log('source run', {roomId: this.orgRoom.id, sourceId: this.sourceId});

    const colony = this.orgRoom.getColony();
    if (!colony) {
      trace.error('no colony');
      return terminate();
    }

    const room = this.orgRoom.getRoomObject();
    if (!room) {
      trace.error('terminate source: no room', {id: this.id, roomId: this.orgRoom.id});
      return terminate();
    }

    const source: Source | Mineral = Game.getObjectById(this.sourceId);
    if (!source) {
      trace.error('source not found', {id: this.sourceId});
      return terminate();
    }

    this.threadUpdateStructures(trace, source);
    this.threadUpdateDropoff(trace, colony);
    this.threadRequestWorkers(trace, kingdom, colony, room, source);
    this.threadRequestHauling(trace, colony);

    this.updateStats(kingdom);

    return running();
  }

  updateStructures(trace: Tracer, source: Source | Mineral) {
    // Pick container
    const containers = source.pos.findInRange<StructureContainer>(FIND_STRUCTURES, 2, {
      filter: (structure) => {
        return structure.structureType === STRUCTURE_CONTAINER;
      },
    });
    this.containerId = source.pos.findClosestByRange<StructureContainer>(containers)?.id;

    // Pick link
    const links = source.pos.findInRange<StructureLink>(FIND_STRUCTURES, 2, {
      filter: (structure) => {
        return structure.structureType === STRUCTURE_LINK;
      },
    });
    this.linkId = source.pos.findClosestByRange<StructureLink>(links)?.id;
  }

  updateDropoff(trace: Tracer, colony: Colony) {
    const primaryRoom = colony.getPrimaryRoom();
    this.dropoffId = primaryRoom.getReserveStructureWithRoomForResource(RESOURCE_ENERGY)?.id;
  }

  requestWorkers(trace: Tracer, kingdom: Kingdom, colony: Colony, room: Room, source: Source | Mineral) {
    if (room.controller?.owner && room.controller.owner.username !== kingdom.config.username) {
      trace.notice('room owned by someone else', {roomId: room.name, owner: room.controller?.owner?.username});
      return;
    }

    if (room.controller?.reservation && room.controller.reservation.username !== kingdom.config.username) {
      trace.notice('room reserved by someone else', {roomId: room.name, username: room.controller.reservation.username});
      return;
    }

    let desiredNumWorkers = 0;
    let desiredWorkerPriority = 0;
    let desiredWorkerType = WORKER_HARVESTER;

    const primaryRoom = colony.getPrimaryRoom();
    if (primaryRoom.hasStorage) {
      if (source instanceof Mineral) {
        // if mineral && storage, 1 harvester
        desiredNumWorkers = 1;
        desiredWorkerType = WORKER_HARVESTER;
        desiredWorkerPriority = PRIORITY_HARVESTER;

        if (!source.mineralAmount) {
          desiredNumWorkers = 0;
        }
      } else if (this.containerId) {
        // if container && storage, 1 miner
        desiredNumWorkers = 1;
        desiredWorkerType = WORKER_MINER;
        desiredWorkerPriority = PRIORITY_MINER;
      } else {
        // 3 harvesters
        desiredNumWorkers = 3;
        desiredWorkerType = WORKER_HARVESTER;
        desiredWorkerPriority = PRIORITY_HARVESTER;
      }
    } else {
      // no storage, 2 upgraders
      desiredNumWorkers = 2;
      if (this.orgRoom.getRoomLevel() >= 3) {
        desiredNumWorkers = 1;
      }

      desiredWorkerType = WORKER_UPGRADER;
      desiredWorkerPriority = PRIORITY_UPGRADER;
    }

    const colonyCreeps = colony.getCreeps();
    const numWorkers = colonyCreeps.filter((creep) => {
      const role = creep.memory[MEMORY.MEMORY_ROLE];
      return role === desiredWorkerType &&
        creep.memory[MEMORY.MEMORY_SOURCE] === this.sourceId &&
        creepIsFresh(creep);
    }).length;

    for (let i = numWorkers; i < desiredNumWorkers; i++) {
      let priority = desiredWorkerPriority;

      const positionStr = [this.position.x, this.position.y, this.position.roomName].join(',');
      const details = {
        role: desiredWorkerType,
        memory: {
          [MEMORY.MEMORY_SOURCE]: this.sourceId,
          [MEMORY.MEMORY_SOURCE_CONTAINER]: this.containerId,
          [MEMORY.MEMORY_SOURCE_POSITION]: positionStr,
          [MEMORY.MEMORY_ASSIGN_ROOM]: room.name,
          [MEMORY.MEMORY_COLONY]: this.orgRoom.getColony().id,
        },
      }

      trace.notice('requesting worker', {roomId: room.name, sourceId: this.sourceId, details});

      colony.getPrimaryRoom().requestSpawn(priority, details, REQUEST_WORKER_TTL);
    }
  }

  requestHauling(trace: Tracer, colony: Colony) {
    const haulers = colony.getHaulers();
    const haulersWithTask = haulers.filter((creep) => {
      const task = creep.memory[MEMORY.MEMORY_TASK_TYPE];
      const pickup = creep.memory[MEMORY.MEMORY_HAUL_PICKUP];
      return task === TASKS.TASK_HAUL && pickup === this.containerId;
    });

    const avgHaulerCapacity = colony.getAvgHaulerCapacity();

    const haulerCapacity = haulersWithTask.reduce((total, hauler) => {
      return total += hauler.store.getFreeCapacity();
    }, 0);

    const container = Game.getObjectById(this.containerId);
    if (!container) {
      return;
    }

    const averageLoad = avgHaulerCapacity;
    const loadSize = _.min([averageLoad, 1000]);
    const storeCapacity = container.store.getCapacity();
    const storeUsedCapacity = container.store.getUsedCapacity();
    const untaskedUsedCapacity = storeUsedCapacity - haulerCapacity;
    const loadsToHaul = Math.floor(untaskedUsedCapacity / loadSize);

    for (let i = 0; i < loadsToHaul; i++) {
      const loadPriority = (storeUsedCapacity - (i * loadSize)) / storeCapacity;

      const details = {
        [MEMORY.TASK_ID]: `sch-${this.sourceId}-${Game.time}`,
        [MEMORY.MEMORY_TASK_TYPE]: TASKS.TASK_HAUL,
        [MEMORY.MEMORY_HAUL_PICKUP]: this.containerId,
        [MEMORY.MEMORY_HAUL_DROPOFF]: this.dropoffId,
        [MEMORY.MEMORY_HAUL_RESOURCE]: RESOURCE_ENERGY,
      };

      trace.log('requesting hauling', {sourceId: this.sourceId});

      colony.sendRequest(TOPICS.TOPIC_HAUL_TASK, loadPriority, details, REQUEST_HAULING_TTL);
    }
  }

  updateStats(kingdom: Kingdom) {
    const source = Game.getObjectById(this.sourceId);
    if (!source || !(source instanceof Source)) {
      return;
    }

    const container = Game.getObjectById(this.containerId);

    const stats = kingdom.getStats();
    const sourceStats = {
      energy: source.energy,
      capacity: source.energyCapacity,
      regen: source.ticksToRegeneration,
      containerFree: (container != null) ? container.store.getFreeCapacity() : null,
    };

    const conlonyId = this.orgRoom.getColony().id;
    const roomId = this.orgRoom.id;
    stats.colonies[conlonyId].rooms[roomId].sources[this.sourceId] = sourceStats;
  }
}
