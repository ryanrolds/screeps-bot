import * as behaviorTree from './lib.behaviortree';
import {FAILURE, SUCCESS, RUNNING} from './lib.behaviortree';

const MEMORY = require('./constants.memory');
const TASKS = require('./constants.tasks');

export const getHaulTaskFromTopic = function (topic) {
  return behaviorTree.leafNode(
    'pick_haul_task',
    (creep, trace, kingdom) => {
      // lookup colony from kingdom
      const colonyId = creep.memory[MEMORY.MEMORY_COLONY];
      const colony = kingdom.getColonyById(colonyId);

      if (!colony) {
        trace.log('could not find colony', {name: creep.name, memory: creep.memory});
        creep.suicide();
        return FAILURE;
      }

      // get next haul task
      const task = colony.getNextRequest(topic);
      if (!task) {
        trace.log('no haul task');
        return FAILURE;
      }

      this.storeHaulTask(creep, task, trace);

      return SUCCESS;
    },
  );
};

export const getNearbyHaulTaskFromTopic = function (topic) {
  return behaviorTree.leafNode(
    'pick_nearby_haul_task',
    (creep, trace, kingdom) => {
      // lookup colony from kingdom
      const colonyId = creep.memory[MEMORY.MEMORY_COLONY];
      const colony = kingdom.getColonyById(colonyId);

      if (!colony) {
        trace.log('could not find colony', {name: creep.name, memory: creep.memory});
        creep.suicide();
        return FAILURE;
      }

      // get next haul task
      const task = colony.getTopics().getMessageOfMyChoice(topic, (messages) => {
        let selected = null;
        let selectedDistance = 99999;

        messages.forEach((message) => {
          const pickupId = message.details[MEMORY.MEMORY_HAUL_PICKUP];
          if (!pickupId) {
            trace.log('no pickup id', {message});
            return;
          }

          const pickup = Game.getObjectById<Id<Structure>>(pickupId);
          if (!pickup) {
            trace.log('could not find object to pickup', {pickupId});
            return;
          }

          if (pickup.room.name !== creep.room.name) {
            return;
          }

          const distance = creep.pos.getRangeTo(pickup);
          if (distance < selectedDistance) {
            selected = message;
            selectedDistance = distance;
          }
        });

        return selected;
      });
      if (!task) {
        return FAILURE;
      }

      this.storeHaulTask(creep, task, trace);

      return SUCCESS;
    },
  );
};

export const storeHaulTask = (creep, task, trace) => {
  trace.log('store haul task', {task});

  // set task details
  creep.memory[MEMORY.TASK_ID] = task.details[MEMORY.TASK_ID];
  creep.memory[MEMORY.MEMORY_TASK_TYPE] = TASKS.TASK_HAUL;
  creep.memory[MEMORY.MEMORY_HAUL_PICKUP] = task.details[MEMORY.MEMORY_HAUL_PICKUP];
  creep.memory[MEMORY.MEMORY_HAUL_RESOURCE] = task.details[MEMORY.MEMORY_HAUL_RESOURCE];

  if (task.details[MEMORY.MEMORY_HAUL_AMOUNT]) {
    creep.memory[MEMORY.MEMORY_HAUL_AMOUNT] = task.details[MEMORY.MEMORY_HAUL_AMOUNT];
  } else {
    // Clear this, "needs energy" task was limiting regular haul tasks
    delete creep.memory[MEMORY.MEMORY_HAUL_AMOUNT];
  }

  creep.memory[MEMORY.MEMORY_HAUL_DROPOFF] = task.details[MEMORY.MEMORY_HAUL_DROPOFF];

  // const taskId = creep.memory[MEMORY.TASK_ID] || '?';
  // creep.say(taskId);
};

export const clearTask = behaviorTree.leafNode(
  'clear_haul_task',
  (creep, trace, kingdom) => {
    delete creep.memory[MEMORY.MEMORY_TASK_TYPE];
    delete creep.memory[MEMORY.MEMORY_HAUL_PICKUP];
    delete creep.memory[MEMORY.MEMORY_HAUL_RESOURCE];
    delete creep.memory[MEMORY.MEMORY_HAUL_AMOUNT];
    delete creep.memory[MEMORY.MEMORY_HAUL_DROPOFF];
    delete creep.memory[MEMORY.MEMORY_DESTINATION];

    return SUCCESS;
  },
);

export const loadCreep = behaviorTree.leafNode(
  'load_resource',
  (creep, trace, kingdom) => {
    if (creep.store.getFreeCapacity() === 0) {
      trace.log('creep is full');
      return SUCCESS;
    }

    const pickup: any = Game.getObjectById(creep.memory[MEMORY.MEMORY_HAUL_PICKUP]);
    if (!pickup) {
      creep.say('⬆❌');
      trace.error('could not find pickup', {id: creep.memory[MEMORY.MEMORY_HAUL_PICKUP]});
      return FAILURE;
    }

    const resource = creep.memory[MEMORY.MEMORY_HAUL_RESOURCE] || undefined;
    let amount = creep.memory[MEMORY.MEMORY_HAUL_AMOUNT] || undefined;

    let result = null;
    if (pickup instanceof Resource) {
      const resource: Resource = pickup;

      result = creep.pickup(pickup);

      trace.log('pickup resource', {
        pickup: pickup.id,
      });
    } else {
      const structure: AnyStoreStructure = pickup;

      if (amount > creep.store.getFreeCapacity(resource)) {
        amount = creep.store.getFreeCapacity(resource);
      }

      if (amount > structure.store.getUsedCapacity(resource)) {
        amount = structure.store.getUsedCapacity(resource);
      }

      // If we are seeing a specific amount, we are done when we have that amount in the hold
      if (creep.store.getUsedCapacity(resource) >= amount) {
        return SUCCESS;
      }

      if (amount === 0) {
        trace.error('zero amount', {resource, amount, creep, pickup});
        return FAILURE;
      }

      result = creep.withdraw(structure, resource, amount);

      trace.log('withdraw resource', {
        structure: structure.id,
        resource,
        amount,
        result,
      });
    }

    if (result !== OK) {
      trace.error('could not load resource', {result, creep, pickup});
    }

    if (result === ERR_INVALID_ARGS) {
      trace.error('invalid args', {resource, amount, pickup});
      return FAILURE;
    }

    if (result === ERR_FULL) {
      return SUCCESS;
    }

    if (result === ERR_NOT_ENOUGH_RESOURCES) {
      return SUCCESS;
    }

    if (result !== OK) {
      trace.error('could not load resource', {result, resource, amount, pickup});
      return FAILURE;
    }

    return RUNNING;
  },
);