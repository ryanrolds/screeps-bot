
const behaviorTree = require('lib.behaviortree');
const {FAILURE, SUCCESS, RUNNING} = require('lib.behaviortree');
const behaviorMovement = require('behavior.movement');
const {MEMORY_HARVEST, MEMORY_HARVEST_ROOM} = require('constants.memory');
const {numMyCreepsNearby, numEnemeiesNearby} = require('helpers.proximity');

module.exports.selectHarvestSource = behaviorTree.leafNode(
  'bt.harvest.selectHarvestSource',
  (creep) => {
    // Don't look up a new source if creep already has one
    if (creep.memory[MEMORY_HARVEST]) {
      const source = Game.getObjectById(creep.memory[MEMORY_HARVEST]);
      if (source) {
        behaviorMovement.setSource(creep, source.id);
        return SUCCESS;
      }

      return FAILURE;
    }

    let sources = creep.room.find(FIND_SOURCES);

    sources = _.filter(sources, (source) => {
      // Do not send creeps to sources with hostiles near by
      return numEnemeiesNearby(source.pos, 5) < 1;
    });

    // Sort by the number of creeps by the source
    sources = _.sortBy(sources, (source) => {
      return numMyCreepsNearby(source.pos, 8);
    });

    if (!sources || !sources.length) {
      return FAILURE;
    }

    const source = sources[0];

    behaviorMovement.setSource(creep, source.id);
    return SUCCESS;
  },
);

module.exports.moveToHarvestRoom = behaviorTree.repeatUntilSuccess(
  'bt.movement.room.harvest',
  behaviorTree.leafNode(
    'move_to_harvest_room',
    (creep) => {
      const room = creep.memory[MEMORY_HARVEST_ROOM];
      // If creep doesn't have a harvest room assigned, we are done
      if (!room) {
        return SUCCESS;
      }
      // If the creep reaches the room we are done
      if (creep.room.name === room) {
        return SUCCESS;
      }

      const result = creep.moveTo(new RoomPosition(25, 25, room));
      if (result === ERR_NO_PATH) {
        return FAILURE;
      }
      if (result === ERR_INVALID_ARGS) {
        return FAILURE;
      }

      return RUNNING;
    },
  ),
);

module.exports.moveToHarvest = behaviorTree.leafNode(
  'move_to_source',
  (creep) => {
    return behaviorMovement.moveToSource(creep, 1);
  },
);

module.exports.harvest = behaviorTree.leafNode(
  'fill_creep',
  (creep) => {
    const destination = Game.getObjectById(creep.memory.source);
    if (!destination) {
      return FAILURE;
    }

    const result = creep.harvest(destination);
    if (result === ERR_FULL) {
      return SUCCESS;
    }
    if (creep.store.getFreeCapacity() === 0) {
      return SUCCESS;
    }
    if (result === ERR_NOT_ENOUGH_RESOURCES) {
      return RUNNING;
    }
    if (result == OK) {
      return RUNNING;
    }

    return FAILURE;
  },
);
