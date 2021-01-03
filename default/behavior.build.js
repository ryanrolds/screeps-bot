const behaviorTree = require('./lib.behaviortree');
const {FAILURE, SUCCESS, RUNNING} = require('./lib.behaviortree');
const behaviorMovement = require('./behavior.movement');
const {MEMORY_FLAG} = require('./constants.memory');

const selectSite = behaviorTree.leafNode(
  'selectSite',
  (creep) => {
    let sites = creep.room.find(FIND_CONSTRUCTION_SITES);
    if (!sites || !sites.length) {
      return behaviorTree.FAILURE;
    }

    sites = _.sortBy(sites, (site) => {
      switch (site.structureType) {
        case STRUCTURE_SPAWN:
          return 0 - site.progress / site.progressTotal;
        case STRUCTURE_EXTENSION:
          return 1 - site.progress / site.progressTotal;
        case STRUCTURE_STORAGE:
        case STRUCTURE_CONTAINER:
          return 2 - site.progress / site.progressTotal;
        case STRUCTURE_TOWER:
          return 3 - site.progress / site.progressTotal;
        case STRUCTURE_ROAD:
          return 11 - site.progress / site.progressTotal;
        case STRUCTURE_RAMPART:
        case STRUCTURE_WALL:
          return 12 - site.progress / site.progressTotal;
        default:
          return 10 - site.progress / site.progressTotal;
      }
    });

    behaviorMovement.setDestination(creep, sites[0].id, sites[0].room.id);

    return behaviorTree.SUCCESS;
  },
);

const selectSiteNearFlag = behaviorTree.leafNode(
  'selectSiteNearFlag',
  (creep) => {
    const flagID = creep.memory[MEMORY_FLAG];
    if (!flagID) {
      return FAILURE;
    }

    const flag = Game.flags[flagID];
    if (!flag) {
      return FAILURE;
    }

    if (!flag.room) {
      return FAILURE;
    }

    const target = flag.pos.findClosestByRange(FIND_CONSTRUCTION_SITES);
    if (!target) {
      return FAILURE;
    }

    behaviorMovement.setDestination(creep, target.id, target.room.id);
    return SUCCESS;
  },
);

const build = behaviorTree.leafNode(
  'build',
  (creep) => {
    const destination = Game.getObjectById(creep.memory.destination);
    if (!destination) {
      return FAILURE;
    }

    const result = creep.build(destination);
    if (result === ERR_NOT_ENOUGH_RESOURCES) {
      return SUCCESS;
    }
    if (result === ERR_INVALID_TARGET) {
      return FAILURE;
    }
    if (result != OK) {
      return FAILURE;
    }
    if (creep.store.getUsedCapacity() === 0) {
      return SUCCESS;
    }

    return RUNNING;
  },
);

module.exports = {
  selectSite,
  build,
  selectSiteNearFlag,
};