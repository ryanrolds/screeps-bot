
const behaviorTree = require('lib.behaviortree')
const {FAILURE, SUCCESS, RUNNING} = require('lib.behaviortree')
const behaviorMovement = require('behavior.movement')
const behaviorStorage = require('behavior.storage')

const MEMORY = require('constants.memory')
const TASKS = require('constants.tasks')
const CREEPS = require('constants.creeps')
const TOPICS = require('constants.topics')

const behavior = behaviorTree.SequenceNode(
    'haul_task',
    [
        behaviorTree.LeafNode(
            'pick_haul_task',
            (creep, trace, kingdom) => {
                // lookup colony from kingdom
                const colonyId = creep.memory[MEMORY.MEMORY_COLONY]
                const colony = kingdom.getColonyById(colonyId)

                // get next haul task
                const task = colony.getNextRequest(TOPICS.TOPIC_HAUL_TASK)

                console.log("hauler task", JSON.stringify(task))

                if (!task) {
                    return FAILURE
                }

                // set task details
                creep.memory[MEMORY.MEMORY_TASK_TYPE] = TASKS.TASK_HAUL
                creep.memory[MEMORY.MEMORY_HAUL_PICKUP] = task.details[MEMORY.MEMORY_HAUL_PICKUP]
                creep.memory[MEMORY.MEMORY_HAUL_RESOURCE] = task.details[MEMORY.MEMORY_HAUL_RESOURCE]
                creep.memory[MEMORY.MEMORY_HAUL_DROPOFF] = task.details[MEMORY.MEMORY_HAUL_DROPOFF]

                return SUCCESS
            }
        ),
        behaviorMovement.moveToCreepMemory(MEMORY.MEMORY_HAUL_PICKUP),
        behaviorTree.LeafNode(
            'load_resource',
            (creep, kingdom) => {
                let pickup = Game.getObjectById(creep.memory[MEMORY.MEMORY_HAUL_PICKUP])
                if (!pickup) {
                    return FAILURE
                }

                let result = creep.withdraw(pickup, creep.memory[MEMORY.MEMORY_HAUL_RESOURCE])
                if (result === ERR_FULL) {
                    return SUCCESS
                }
                if (result === ERR_NOT_ENOUGH_RESOURCES) {
                    return FAILURE
                }
                if (creep.store.getFreeCapacity() === 0) {
                    return SUCCESS
                }
                if (result === OK) {
                    return RUNNING
                }

                return SUCCESS
            }
        ),
        behaviorStorage.emptyCreep
        /* TODO task should include dropoff
        behaviorMovement.moveToCreepMemory(MEMORY.MEMORY_HAUL_DROPOFF),
        behaviorTree.LeafNode(
            'dropoff_resource',
            (creep, kingdom) => {
                let dropoff = Game.getObjectById(creep.memory[MEMORY.MEMORY_HAUL_DROPOFF])
                if (!dropoff) {
                    return behaviorTree.FAILURE
                }

                let result = creep.transfer(destination, RESOURCE_ENERGY)
                if (result === ERR_FULL) {
                    // We still have energy to transfer, fail so we find another
                    // place to dump
                    return FAILURE
                }
                if (result === ERR_NOT_ENOUGH_RESOURCES) {
                    return SUCCESS
                }
                if (creep.store.getUsedCapacity() === 0) {
                    return SUCCESS
                }
                if (result != OK) {
                    return FAILURE
                }

                return RUNNING
            }
        ),
        */
    ]
)

module.exports = {
    run: (creep, trace, kingdom) => {
        const roleTrace = trace.begin('hauler_v3')

        let result = behavior.tick(creep, roleTrace, kingdom)
        if (result == behaviorTree.FAILURE) {
            console.log("INVESTIGATE: hauler_v3 failure", creep.name)
        }

        roleTrace.end()
    }
}
