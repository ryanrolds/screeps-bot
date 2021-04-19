const OrgBase = require('./org.base');

class Scribe extends OrgBase {
  constructor(parent, trace) {
    super(parent, 'scribe', trace);

    const setupTrace = this.trace.begin('constructor');

    // if (!Memory[MEMORY_JOURNAL]) {
    //  Memory[MEMORY_JOURNAL] = {
    //    rooms: {},
    //  };
    // }

    // this.journal = Memory[MEMORY_JOURNAL];
    this.journal = {
      rooms: {},
      creeps: {},
    };

    setupTrace.end();
  }
  update(trace) {
    const updateTrace = trace.begin('update');

    // Memory[MEMORY_JOURNAL] = this.journal;

    console.log(this);

    updateTrace.end();
  }
  process(trace) {
    const processTrace = trace.begin('process');

    this.updateStats();

    processTrace.end();
  }
  toString() {
    return `** Scribe - Rooms: ${Object.keys(this.journal.rooms).length}, `;// +
    // `RecentlyUpdated: ${this.getRoomsUpdatedRecently().length}, ` +
    // `PowerBanks: ${JSON.stringify(this.getRoomsWithPowerBanks())}, ` +
    // `DangerousRooms: ${this.getRoomsWithHostileTowers().length}`;
  }
  removeStaleJournalEntries() {

  }
  updateStats() {

  }
  getOldestRoomInList(rooms) {
    const knownRooms = Object.keys(this.journal.rooms);
    const missingRooms = _.shuffle(_.difference(rooms, knownRooms));

    if (missingRooms.length) {
      return missingRooms[0];
    }

    const inRangeRooms = Object.values(_.pick(this.journal.rooms, rooms));
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
  getWeakRooms() {
    return Object.values(this.journal.rooms).filter((room) => {
      if (!room.controller || room.controller.owner === 'ENETDOWN') {
        return false;
      }

      if (room.controller.level >= 7 || room.controller.level < 1) {
        return false;
      }

      return true;
    }).map((room) => {
      return [room.id, room.numTowers, room.controller.owner];
    });
  }
  updateRoom(roomObject) {
    const room = {
      id: roomObject.name,
      lastUpdated: Game.time,
    };

    room.controller = null;
    if (roomObject.controller) {
      let owner = null;
      if (roomObject.controller.owner) {
        owner = roomObject.controller.owner.username;
      }

      room.controller = {
        owner: owner,
        level: roomObject.controller.level,
        safeModeAvailable: roomObject.controller.safeModeAvailable,
      };
    }

    room.numSources = roomObject.find(FIND_SOURCES).length;
    room.hasHostiles = roomObject.find(FIND_HOSTILE_CREEPS).length > 0;

    room.numTowers = roomObject.find(FIND_HOSTILE_STRUCTURES, {
      filter: (structure) => {
        return structure.structureType === STRUCTURE_TOWER;
      },
    }).length;

    room.mineral = null;
    const minerals = roomObject.find(FIND_MINERALS);
    if (minerals.length) {
      room.mineral = minerals[0].mineralType;
    }

    room.portals = [];
    const portals = roomObject.find(FIND_STRUCTURES, {
      filter: (structure) => {
        return structure.structureType === STRUCTURE_PORTAL;
      },
    });
    room.portals = portals.map((portal) => {
      return {
        id: portal.id,
        pos: portal.pos,
        destinationShard: portal.destination.shard,
        destinationRoom: portal.destination.room,
      };
    });

    room.powerBanks = roomObject.find(FIND_STRUCTURES, {
      filter: (structure) => {
        return structure.structureType === STRUCTURE_POWER_BANK;
      },
    }).map((powerBank) => {
      return {
        id: powerBank.id,
        hits: powerBank.hits,
        ttl: powerBank.ticksToDecay,
        power: powerBank.power,
        pos: {
          x: powerBank.pos.x,
          y: powerBank.pos.y,
          roomName: powerBank.pos.roomName,
        },
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
  getRoom(roomId) {
    return this.journal.rooms[roomId] || null;
  }

  getLocalShardMemory() {
    return JSON.parse(InterShardMemory.getLocal() || '{}');
  }

  setLocalShardMemory(memory) {
    return InterShardMemory.setLocal(JSON.stringify(memory));
  }

  getRemoteShardMemory(shardName) {
    return JSON.parse(InterShardMemory.getRemote(shardName) || '{}');
  }

  getPortals(shardName) {
    const portals = Object.values(this.journal.rooms).filter((room) => {
      return _.filter(room.portals, _.matchesProperty('destinationShard', shardName)).length > 0;
    }).map((room) => {
      return room.portals.reduce((acc, portal) => {
        if (portal.destinationShard === shardName) {
          acc.push(portal);
        }

        return acc;
      });
    }, []);

    return portals;
  }

  setCreepBackup(creep) {
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

  getCreepBackup(shardName, creepName) {
    const remoteMemory = this.getRemoteShardMemory(shardName);
    if (remoteMemory.creep_backups) {
      return remoteMemory.creep_backups[creepName] || null;
    }

    return null;
  }
}

module.exports = Scribe;