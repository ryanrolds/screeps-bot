import {OrgBase} from './org.base';
import {getRegion, Position} from './lib.flood_fill'
import {Kingdom} from './org.kingdom';
import {Colony} from './org.colony';

const COST_MATRIX_TTL = 1500;
const COST_DEFENDER_NOT_BASE = 6;
const JOURNAL_ENTRY_TTL = 250;

type Journal = {
  rooms: Record<string, RoomEntry>;
  creeps: Record<string, Creep>;
  defenderCostMatrices: Record<string, CostMatrixEntry>;
  colonyCostMatrices: Record<string, CostMatrixEntry>;
};

type CostMatrixEntry = {
  id: Id<Room>;
  costs: CostMatrix;
  ttl: number;
};

type PortalEntry = {
  id: Id<StructurePortal>,
  pos: RoomPosition,
  destinationShard: string;
  destinationRoom: string;
};

type RoomEntry = {
  id: Id<Room>,
  lastUpdated: number;
  controller?: {
    owner: string;
    level: number;
    safeMode: number;
    safeModeAvailable: number;
    pos: RoomPosition;
  };
  numSources: number;
  hasHostiles: boolean;
  numTowers: number;
  numKeyStructures: number;
  mineral: MineralConstant;
  portals: PortalEntry[];
  powerBanks: {
    id: Id<StructurePowerBank>;
    hits: number;
    ttl: number;
    power: number;
    pos: RoomPosition;
  }[];
  deposits: {
    type: DepositConstant;
    cooldown: number;
    ttl: number;
  }[];
};

export type TargetRoom = {
  id: Id<Room>;
  numTowers: number;
  numKeyStructures: number;
  owner: string;
  level: number;
  controllerPos: RoomPosition;
};

export class Scribe extends OrgBase {
  journal: Journal;
  costMatrix255: CostMatrix;

  constructor(parent, trace) {
    super(parent, 'scribe', trace);

    this.journal = {
      rooms: {},
      defenderCostMatrices: {},
      colonyCostMatrices: {},
      creeps: {},
    }

    const setupTrace = this.trace.begin('constructor');
    setupTrace.end();
  }
  update(trace) {
    const updateTrace = trace.begin('update');

    Object.values(Game.rooms).forEach((room) => {
      const entry = this.getRoomById(room.name);
      if (!entry || Game.time - entry.lastUpdated > JOURNAL_ENTRY_TTL) {
        this.updateRoom(this.getKingdom(), room);
      }
    });

    updateTrace.end();
  }
  process(trace) {
    const processTrace = trace.begin('process');

    // TODO add stats
    this.updateStats();

    processTrace.end();
  }
  removeStaleJournalEntries() {

  }
  updateStats() {

  }
  getOldestRoomInList(rooms: string[]) {
    const knownRooms = Object.keys(this.journal.rooms);
    const missingRooms = _.shuffle(_.difference(rooms, knownRooms));

    if (missingRooms.length) {
      return missingRooms[0];
    }

    const inRangeRooms: RoomEntry[] = Object.values(_.pick(this.journal.rooms, rooms));
    const sortedRooms = _.sortBy(inRangeRooms, 'lastUpdated');

    return sortedRooms[0].id;
  }
  getRoomsUpdatedRecently() {
    return Object.values(this.journal.rooms).filter((room) => {
      return Game.time - room.lastUpdated < 500;
    }).map((room) => {
      return room.id;
    });
  }
  getRoomsWithPowerBanks() {
    return Object.values(this.journal.rooms).filter((room) => {
      if (!room.powerBanks) {
        return false;
      }

      return room.powerBanks.length > 0;
    }).map((room) => {
      return [room.id, Game.time - room.lastUpdated, room.powerBanks[0].ttl];
    });
  }
  getRoomsWithHostileTowers() {
    return Object.values(this.journal.rooms).filter((room) => {
      if (!room.controller || room.controller.owner === 'ENETDOWN') {
        return false;
      }

      if (!room.numTowers) {
        return false;
      }

      return true;
    }).map((room) => {
      return [room.id, room.numTowers, room.controller.owner];
    });
  }
  getRoomsWithPortals() {
    return Object.values(this.journal.rooms).filter((room) => {
      if (!room.portals) {
        return false;
      }

      return room.portals.length > 0;
    }).map((room) => {
      return [room.id, Game.time - room.lastUpdated, room.portals.map((portal) => {
        return portal.destinationShard;
      })];
    });
  }
  getWeakRooms(): TargetRoom[] {
    return Object.values(this.journal.rooms).filter((room) => {
      if (!room.controller || room.controller.owner === 'ENETDOWN') {
        return false;
      }

      if (room.controller.level >= 7) {
        return false;
      }

      if (room.controller.level < 1) {
        return false;
      }

      if (room.controller.safeMode) {
        return false;
      }

      if (room.numKeyStructures < 1) {
        return false;
      }

      return true;
    }).map((room) => {
      return {
        id: room.id,
        numTowers: room.numTowers,
        numKeyStructures: room.numKeyStructures,
        owner: room.controller.owner,
        level: room.controller.level,
        controllerPos: room.controller.pos,
      };
    });
  }
  updateRoom(kingdom: Kingdom, roomObject: Room) {
    const room: RoomEntry = {
      id: roomObject.name as Id<Room>,
      lastUpdated: Game.time,
      controller: null,
      numSources: 0,
      hasHostiles: false,
      numTowers: 0,
      numKeyStructures: 0,
      mineral: null,
      powerBanks: [],
      portals: [],
      deposits: [],
    };

    if (roomObject.controller) {
      let owner = null;
      if (roomObject.controller.owner) {
        owner = roomObject.controller.owner.username;
      }

      room.controller = {
        owner: owner,
        level: roomObject.controller.level,
        safeMode: roomObject.controller.safeMode || 0,
        safeModeAvailable: roomObject.controller.safeModeAvailable,
        pos: roomObject.controller.pos,
      };
    }

    room.numSources = roomObject.find(FIND_SOURCES).length;

    let hostiles = roomObject.find(FIND_HOSTILE_CREEPS);
    // Filter friendly creeps
    const friends = kingdom.config.friends;
    hostiles = hostiles.filter(creep => friends.indexOf(creep.owner.username) === -1);

    room.hasHostiles = hostiles.length > 0;

    room.numTowers = roomObject.find(FIND_HOSTILE_STRUCTURES, {
      filter: (structure) => {
        return structure.structureType === STRUCTURE_TOWER;
      },
    }).length;

    room.numKeyStructures = roomObject.find(FIND_HOSTILE_STRUCTURES, {
      filter: (structure) => {
        return structure.structureType === STRUCTURE_TOWER ||
          structure.structureType === STRUCTURE_SPAWN ||
          structure.structureType === STRUCTURE_TERMINAL ||
          structure.structureType === STRUCTURE_NUKER;
      },
    }).length;

    room.mineral = null;
    const minerals = roomObject.find(FIND_MINERALS);
    if (minerals.length) {
      room.mineral = minerals[0].mineralType;
    }

    room.portals = [];
    const portals = roomObject.find<StructurePortal>(FIND_STRUCTURES, {
      filter: (structure) => {
        return structure.structureType === STRUCTURE_PORTAL;
      },
    });
    room.portals = portals.map((portal) => {
      return {
        id: portal.id,
        pos: portal.pos,
        destinationShard: (portal.destination as any).shard,
        destinationRoom: (portal.destination as any).room,
      };
    });

    room.powerBanks = roomObject.find<StructurePowerBank>(FIND_STRUCTURES, {
      filter: (structure) => {
        return structure.structureType === STRUCTURE_POWER_BANK;
      },
    }).map((powerBank) => {
      return {
        id: powerBank.id,
        hits: powerBank.hits,
        ttl: powerBank.ticksToDecay,
        power: powerBank.power,
        pos: powerBank.pos,
      };
    });

    room.deposits = roomObject.find(FIND_DEPOSITS).map((deposit) => {
      return {
        type: deposit.depositType,
        cooldown: deposit.cooldown,
        ttl: deposit.ticksToDecay,
      };
    });

    this.journal.rooms[room.id] = room;
  }

  clearRoom(roomId: string) {
    delete this.journal.rooms[roomId];
  }

  getRoomById(roomId): RoomEntry {
    return this.journal.rooms[roomId] || null;
  }

  getLocalShardMemory(): any {
    return JSON.parse(InterShardMemory.getLocal() || '{}');
  }

  setLocalShardMemory(memory: any) {
    return InterShardMemory.setLocal(JSON.stringify(memory));
  }

  getRemoteShardMemory(shardName: string) {
    return JSON.parse(InterShardMemory.getRemote(shardName) || '{}');
  }

  getPortals(shardName: string) {
    const portals = Object.values(this.journal.rooms).filter((room) => {
      return _.filter(room.portals, _.matchesProperty('destinationShard', shardName)).length > 0;
    }).map((room) => {
      return room.portals.reduce((acc: PortalEntry[], portal) => {
        if (portal.destinationShard === shardName) {
          acc.push(portal);
        }

        return acc;
      }, []);
    }, []);

    return portals;
  }

  setCreepBackup(creep: Creep) {
    const localMemory = this.getLocalShardMemory();
    if (!localMemory.creep_backups) {
      localMemory.creep_backups = {};
    }

    localMemory.creep_backups[creep.name] = {
      name: creep.name,
      memory: creep.memory,
      ttl: Game.time,
    };

    localMemory.creep_backups = _.pick(localMemory.creep_backups, (backup) => {
      return Game.time - backup.ttl < 1500;
    });

    this.setLocalShardMemory(localMemory);
  }

  getCreepBackup(shardName: string, creepName: string) {
    const remoteMemory = this.getRemoteShardMemory(shardName);
    if (remoteMemory.creep_backups) {
      return remoteMemory.creep_backups[creepName] || null;
    }

    return null;
  }

  createDefenderCostMatric(room: Room, spawn: RoomPosition): CostMatrix {
    const costs = new PathFinder.CostMatrix();

    return costs;
  }

  getDefenderCostMatrix(room: Room, spawn: RoomPosition): CostMatrix {
    const costMatrixEntry = this.journal.defenderCostMatrices[room.name];
    if (costMatrixEntry && costMatrixEntry.ttl <= Game.time) {
      return
    }

    const costs = this.createDefenderCostMatric(room, spawn);

    this.journal.defenderCostMatrices[room.name] = {
      id: room.name as Id<Room>,
      costs,
      ttl: Game.time + COST_MATRIX_TTL,
    };

    return costs;
  }

  /*
  getColonyCostMatrix(colony: Colony): CostMatrix {
    const costMatrixEntry = this.journal.defenderCostMatrices[room.name];
    if (costMatrixEntry && costMatrixEntry.ttl <= Game.time) {
      return
    }

    const costs = this.createDefenderCostMatric(room, spawn);

    this.journal.defenderCostMatrices[room.name] = {
      id: room.name as Id<Room>,
      costs,
      ttl: Game.time + COST_MATRIX_TTL,
    };

    return costs;
  }
  */

  createColonyCostMatrix(colony: Colony): CostMatrix {
    const room = colony.primaryRoom;
    const spawn = room.find(FIND_STRUCTURES, {
      filter: structure => structure.structureType === STRUCTURE_SPAWN
    })[0];


    if (!spawn) {
      // No spawn, return a cost matrix with 0s
      return new PathFinder.CostMatrix();
    }

    const costs = this.get255CostMatrix();

    // Set every position in base to 0
    const regionValues = Object.values(getRegion(room, spawn.pos));
    regionValues.forEach((pos: Position) => {
      costs.set(pos.x, pos.y, 0);
    });

    return costs;
  }

  get255CostMatrix(): CostMatrix {
    if (this.costMatrix255) {
      return this.costMatrix255.clone();
    }

    const costs = new PathFinder.CostMatrix();
    for (let x = 0; x <= 49; x++) {
      for (let y = 0; y <= 49; y++) {
        costs.set(x, y, 255);
      }
    }

    this.costMatrix255 = costs;

    return costs.clone();
  }

  visualizeCostMatrix(roomName: string, costMatrix: CostMatrix) {
    const visual = new RoomVisual(roomName);

    for (let x = 0; x <= 49; x++) {
      for (let y = 0; y <= 49; y++) {
        const cost = costMatrix.get(x, y);
        visual.text((cost / 5).toString(), x, y);
      }
    }
  }
}
