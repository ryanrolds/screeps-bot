import * as behaviorTree from "./lib.behaviortree";
import * as behaviorAssign from "./behavior.assign";
import * as behaviorMovement from "./behavior.movement";
import behaviorCommute from "./behavior.commute";
import {behaviorBoosts} from "./behavior.boosts";
import behaviorRoom from "./behavior.room";

import * as MEMORY from "./constants.memory";

const behavior = behaviorTree.sequenceNode(
  'upgrader_root',
  [
    behaviorRoom.getEnergy,
    behaviorMovement.moveToShard(MEMORY.MEMORY_ASSIGN_SHARD),
    behaviorAssign.moveToRoom,
    behaviorTree.leafNode(
      'pick_room_controller',
      (creep) => {
        behaviorMovement.setDestination(creep, creep.room.controller.id);
        return behaviorTree.SUCCESS;
      },
    ),
    behaviorMovement.moveToDestination(3, false, 25, 1500),
    behaviorCommute.setCommuteDuration,
    behaviorTree.repeatUntilSuccess(
      'upgrade_until_empty',
      behaviorTree.leafNode(
        'upgrade_controller',
        (creep) => {
          const destination = Game.getObjectById(creep.memory['destination']);
          if (!destination) {
            return behaviorTree.FAILURE;
          }

          const result = creep.upgradeController(creep.room.controller);
          if (result == ERR_NOT_ENOUGH_RESOURCES) {
            return behaviorTree.SUCCESS;
          }

          if (result != OK) {
            return behaviorTree.FAILURE;
          }

          return behaviorTree.RUNNING;
        },
      ),
    ),
    behaviorRoom.updateSign,
  ],
);


export const roleUpgrader = {
  run: behaviorTree.rootNode('upgrader', behaviorBoosts(behavior)),
};
