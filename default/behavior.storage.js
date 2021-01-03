
const behaviorTree = require('./lib.behaviortree');
const {FAILURE, SUCCESS, RUNNING} = require('./lib.behaviortree');
const behaviorMovement = require('./behavior.movement');
const MEMORY = require('./constants.memory');

const {MEMORY_ROLE, MEMORY_DESTINATION, MEMORY_ORIGIN} = require('./constants.memory');
const {WORKER_DISTRIBUTOR, WORKER_HAULER} = require('./constants.creeps');

const spawnContainerCache = {};

const selectEnergyForWithdraw = module.exports.selectEnergyForWithdraw = behaviorTree.leafNode(
  'selectEnergyForWithdraw',
  (creep) => {
    const spawnContainers = spawnContainerCache[creep.room.name];
    if (!spawnContainers || Game.tick % 100 === 0) {
      const spawns = creep.room.find(FIND_STRUCTURES, {
        filter: (structure) => {
          return structure.structureType === STRUCTURE_SPAWN;
        },
      });

      const spawnContainers = _.reduce(spawns, (acc, spawn) => {
        const containers = spawn.pos.findInRange(FIND_STRUCTURES, 8, {
          filter: (structure) => {
            return (structure.structureType == STRUCTURE_CONTAINER ||
              structure.structureType == STRUCTURE_STORAGE) &&
              structure.store.getUsedCapacity(RESOURCE_ENERGY) > 0;
          },
        });

        return acc.concat(containers);
      }, []);

      spawnContainerCache[creep.room.name] = spawnContainers;
    }

    const target = creep.pos.findClosestByRange(spawnContainers);
    if (!target) {
      return FAILURE;
    }

    behaviorMovement.setDestination(creep, target.id);
    return SUCCESS;
  },
);

const selectContainerForWithdraw = module.exports.selectContainerForWithdraw = behaviorTree.leafNode(
  'selectContainerForWithdraw',
  (creep) => {
    const target = creep.pos.findClosestByRange(FIND_STRUCTURES, {
      filter: (structure) => {
        return (structure.structureType == STRUCTURE_CONTAINER ||
          structure.structureType == STRUCTURE_STORAGE ||
          structure.structureType == STRUCTURE_LINK) &&
          structure.store.getUsedCapacity(RESOURCE_ENERGY) > 0;
      },
    });

    if (!target) {
      return FAILURE;
    }

    behaviorMovement.setDestination(creep, target.id);
    return SUCCESS;
  },
);

const selectRoomDropoff = module.exports.selectRoomDropoff = behaviorTree.selectorNode(
  'selectRoomDropoff',
  [
    behaviorTree.leafNode(
      'use_memory_dropoff',
      (creep) => {
        const dropoff = creep.memory[MEMORY.MEMORY_HAUL_DROPOFF];
        if (dropoff) {
          behaviorMovement.setDestination(creep, dropoff);
          return SUCCESS;
        }

        return FAILURE;
      },
    ),
    behaviorTree.leafNode(
      'pick_adjacent_container',
      (creep) => {
        const role = creep.memory[MEMORY_ROLE];
        // haulers should pick containers near the spawner
        // TODO this is hacky and feels bad
        if (role && (role === WORKER_DISTRIBUTOR || role === WORKER_HAULER)) {
          return FAILURE;
        }

        const targets = creep.pos.findInRange(FIND_STRUCTURES, 2, {
          filter: (structure) => {
            return structure.structureType == STRUCTURE_CONTAINER &&
              structure.structureType == STRUCTURE_CONTAINER &&
              structure.store.getFreeCapacity(RESOURCE_ENERGY) > 0;
          },
        });

        if (!targets || !targets.length) {
          return FAILURE;
        }

        behaviorMovement.setDestination(creep, targets[0].id);
        return SUCCESS;
      },
    ),
    behaviorTree.leafNode(
      'pick_adjacent_link',
      (creep) => {
        const role = creep.memory[MEMORY_ROLE];
        if (role && role === WORKER_DISTRIBUTOR) {
          return FAILURE;
        }

        const targets = creep.pos.findInRange(FIND_STRUCTURES, 2, {
          filter: (structure) => {
            // TODO things seeking to gain energy should use another function
            return structure.structureType == STRUCTURE_LINK;
          },
        });

        if (!targets || !targets.length) {
          return FAILURE;
        }

        behaviorMovement.setDestination(creep, targets[0].id);
        return SUCCESS;
      },
    ),
    behaviorTree.leafNode(
      'pick_storage',
      (creep) => {
        const role = creep.memory[MEMORY_ROLE];
        if (role && role === WORKER_DISTRIBUTOR) {
          return FAILURE;
        }

        const originID = creep.memory[MEMORY_ORIGIN];
        if (!originID) {
          return FAILURE;
        }

        const room = Game.rooms[originID];
        if (!room) {
          return FAILURE;
        }

        if (!room.storage) {
          return FAILURE;
        }

        const distributors = room.find(FIND_MY_CREEPS, {
          filter: (creep) => {
            return creep.memory[MEMORY_ROLE] === WORKER_DISTRIBUTOR;
          },
        });

        if (!distributors.length) {
          return FAILURE;
        }

        behaviorMovement.setDestination(creep, room.storage.id);
        return SUCCESS;
      },
    ),
    behaviorTree.leafNode(
      'pick_container',
      (creep) => {
        const role = creep.memory[MEMORY_ROLE];
        if (role && role === WORKER_DISTRIBUTOR) {
          return FAILURE;
        }

        const originID = creep.memory[MEMORY_ORIGIN];
        if (!originID) {
          return FAILURE;
        }

        const room = Game.rooms[originID];
        if (!room) {
          return FAILURE;
        }

        const distributors = room.find(FIND_MY_CREEPS, {
          filter: (creep) => {
            return creep.memory[MEMORY_ROLE] === WORKER_DISTRIBUTOR;
          },
        });

        if (!distributors.length) {
          return FAILURE;
        }

        const spawns = creep.room.find(FIND_STRUCTURES, {
          filter: (structure) => {
            return structure.structureType === STRUCTURE_SPAWN;
          },
        });
        const spawnContainers = _.reduce(spawns, (acc, spawn) => {
          const containers = spawn.pos.findInRange(FIND_STRUCTURES, 8, {
            filter: (structure) => {
              return structure.structureType == STRUCTURE_CONTAINER &&
                structure.store.getFreeCapacity(RESOURCE_ENERGY) > 0;
            },
          });

          return acc.concat(containers);
        }, []);

        const target = creep.pos.findClosestByRange(spawnContainers);
        if (!target) {
          return FAILURE;
        }

        behaviorMovement.setDestination(creep, target.id);
        return SUCCESS;
      },
    ),
    behaviorTree.leafNode(
      'pick_spawner_extension',
      (creep) => {
        const originID = creep.memory[MEMORY_ORIGIN];
        if (!originID) {
          return FAILURE;
        }

        const room = Game.rooms[originID];
        if (!room) {
          return FAILURE;
        }

        const targets = room.find(FIND_STRUCTURES, {
          filter: (structure) => {
            return (structure.structureType == STRUCTURE_EXTENSION ||
              structure.structureType == STRUCTURE_SPAWN) &&
              structure.store.getFreeCapacity(RESOURCE_ENERGY) > 0;
          },
        });

        if (!targets.length) {
          return FAILURE;
        }

        behaviorMovement.setDestination(creep, targets[0].id);
        return SUCCESS;
      },
    ),
  ],
);

module.exports.pickStorage = behaviorTree.selectorNode(
  'pickStorage',
  [
    behaviorTree.leafNode(
      'pick_adjacent_container',
      (creep) => {
        const role = creep.memory[MEMORY_ROLE];
        // haulers should pick containers near the spawner
        // TODO this is hacky and feels bad
        if (role && role === WORKER_HAULER || role === WORKER_DISTRIBUTOR) {
          return FAILURE;
        }

        const targets = creep.pos.findInRange(FIND_STRUCTURES, 1, {
          filter: (structure) => {
            return structure.structureType == STRUCTURE_CONTAINER &&
              structure.store.getFreeCapacity(RESOURCE_ENERGY) > 0;
          },
        });

        if (!targets || !targets.length) {
          return FAILURE;
        }

        behaviorMovement.setDestination(creep, targets[0].id);
        return SUCCESS;
      },
    ),
    behaviorTree.leafNode(
      'pick_spawner_extension',
      (creep) => {
        const originID = creep.memory[MEMORY_ORIGIN];
        if (!originID) {
          return FAILURE;
        }

        const room = Game.rooms[originID];
        if (!room) {
          return FAILURE;
        }

        const targets = room.find(FIND_STRUCTURES, {
          filter: (structure) => {
            return (structure.structureType == STRUCTURE_EXTENSION ||
              structure.structureType == STRUCTURE_SPAWN) &&
              structure.store.getFreeCapacity(RESOURCE_ENERGY) > 0;
          },
        });

        if (!targets.length) {
          return FAILURE;
        }

        behaviorMovement.setDestination(creep, targets[0].id);
        return SUCCESS;
      },
    ),
    behaviorTree.leafNode(
      'pick_tower',
      (creep) => {
        const originID = creep.memory[MEMORY_ORIGIN];
        if (!originID) {
          return FAILURE;
        }

        const room = Game.rooms[originID];
        if (!room) {
          return FAILURE;
        }

        const targets = room.find(FIND_STRUCTURES, {
          filter: (structure) => {
            return structure.structureType == STRUCTURE_TOWER &&
              structure.store.getFreeCapacity(RESOURCE_ENERGY) > 100;
          },
        });

        if (!targets.length) {
          return FAILURE;
        }

        behaviorMovement.setDestination(creep, targets[0].id);
        return SUCCESS;
      },
    ),
    behaviorTree.leafNode(
      'pick_storage',
      (creep) => {
        const originID = creep.memory[MEMORY_ORIGIN];
        if (!originID) {
          return FAILURE;
        }

        const room = Game.rooms[originID];
        if (!room) {
          return FAILURE;
        }

        if (!room.storage) {
          return FAILURE;
        }

        behaviorMovement.setDestination(creep, room.storage.id);
        return SUCCESS;
      },
    ),
    behaviorTree.leafNode(
      'pick_container',
      (creep) => {
        const targets = Game.spawns['Spawn1'].pos.findInRange(FIND_STRUCTURES, 8, {
          filter: (structure) => {
            return structure.structureType == STRUCTURE_CONTAINER &&
              structure.store.getFreeCapacity(RESOURCE_ENERGY) > 0;
          },
        });

        if (!targets || !targets.length) {
          return FAILURE;
        }

        behaviorMovement.setDestination(creep, targets[0].id);
        return SUCCESS;
      },
    ),
  ],
);

module.exports.fillCreep = behaviorTree.sequenceNode(
  'energy_supply',
  [
    selectEnergyForWithdraw,
    behaviorMovement.moveToDestination(1),
    behaviorTree.leafNode(
      'fill_creep',
      (creep) => {
        return behaviorMovement.fillCreepFromDestination(creep);
      },
    ),
  ],
);

module.exports.fillCreepFrom = (from) => {
  return behaviorTree.sequenceNode(
    `fill_creep_from_${from}`,
    [
      from,
      behaviorMovement.moveToDestination(1),
      behaviorTree.leafNode(
        'fill_creep_from_destination',
        (creep) => {
          return behaviorMovement.fillCreepFromDestination(creep);
        },
      ),
    ],
  );
};

module.exports.fillCreepFromContainers = behaviorTree.sequenceNode(
  'energy_supply_containers',
  [
    selectContainerForWithdraw,
    behaviorMovement.moveToDestination(1),
    behaviorTree.leafNode(
      'fill_creep',
      (creep) => {
        return behaviorMovement.fillCreepFromDestination(creep);
      },
    ),
  ],
);

module.exports.emptyCreep = behaviorTree.repeatUntilSuccess(
  'transfer_until_empty',
  behaviorTree.sequenceNode(
    'dump_energy',
    [
      selectRoomDropoff,
      behaviorMovement.moveToDestinationRoom,
      behaviorMovement.moveToDestination(1),
      behaviorTree.leafNode(
        'empty_creep',
        (creep) => {
          const destination = Game.getObjectById(creep.memory[MEMORY_DESTINATION]);
          if (!destination) {
            return FAILURE;
          }

          let resource = Object.keys(creep.store).pop();
          if (creep.memory[MEMORY.MEMORY_HAUL_RESOURCE]) {
            resource = creep.memory[MEMORY.MEMORY_HAUL_RESOURCE]
          }

          let amount = undefined
          if (creep.memory[MEMORY.MEMORY_HAUL_AMOUNT]) {
            amount = creep.memory[MEMORY.MEMORY_HAUL_AMOUNT]
          }

          const result = creep.transfer(destination, resource, amount);
          console.log('transfer', destination.id, resource, amount)
          if (result === ERR_FULL) {
            return SUCCESS;
          }
          if (result === ERR_NOT_ENOUGH_RESOURCES) {
            return SUCCESS;
          }
          if (creep.store.getUsedCapacity() === 0) {
            return SUCCESS;
          }
          if (result != OK) {
            return FAILURE;
          }

          return RUNNING;
        },
      ),
    ],
  ),
);
