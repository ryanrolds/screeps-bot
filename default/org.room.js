
const OrgBase = require('org.base')
const Link = require('org.link')
const Tower = require('org.tower')
const Topics = require('lib.topics')

const MEMORY = require('constants.memory')

const { MEMORY_ROLE, MEMORY_ASSIGN_ROOM } = require('constants.memory')
const { TOPIC_SPAWN, TOPIC_DEFENDERS } = require('constants.topics')
const { WORKER_UPGRADER, WORKER_REPAIRER, WORKER_BUILDER, WORKER_DEFENDER } = require('constants.creeps')
const { PRIORITY_UPGRADER, PRIORITY_BUILDER, PRIORITY_REPAIRER, PRIORITY_BOOTSTRAP,
    PRIORITY_REPAIRER_URGENT, PRIORITY_DEFENDER, PRIORITY_CLAIMER } = require('constants.priorities')
const { WORKER_CLAIMER, WORKER_RESERVER, WORKER_DISTRIBUTOR } = require('./constants.creeps')
const { PRIORITY_RESERVER, PRIORITY_DISTRIBUTOR } = require('./constants.priorities')

const MAX_UPGRADERS = 2
const MIN_DISTRIBUTORS = 2

class Room extends OrgBase {
    constructor(parent, room) {
        super(parent, room.name)

        this.topics = new Topics()

        this.gameObject = room
        this.isPrimary = room.name === parent.primaryRoomId
        this.claimedByMe = room.controller.my || false

        this.hasClaimer = _.filter(Game.creeps, (creep) => {
            return creep.memory[MEMORY_ROLE] === WORKER_CLAIMER &&
                creep.memory[MEMORY_ASSIGN_ROOM] === room.name
        }).length > 0

        this.hasReserver = _.filter(Game.creeps, (creep) => {
            return creep.memory[MEMORY_ROLE] === WORKER_RESERVER &&
                creep.memory[MEMORY_ASSIGN_ROOM] === room.name &&
                (creep.ticksToLive > (creep.memory[MEMORY.MEMORY_COMMUTE_DURATION] || 100))
        }).length > 0

        this.reservationTicks = 0
        if (room.controller.reservation) {
            this.reservationTicks = room.controller.reservation.ticksToEnd
        }

        this.links = room.find(FIND_MY_STRUCTURES, {
            filter: (structure) => {
                return structure.structureType === STRUCTURE_LINK
            }
        }).map((link) => {
            return new Link(this, link)
        })

        // TODO build out org towers
        this.towers = room.find(FIND_MY_STRUCTURES, {
            filter: (structure) => {
                return structure.structureType === STRUCTURE_TOWER
            }
        }).map((tower) => {
            return new Tower(this, tower)
        })

        this.myCreeps = room.find(FIND_MY_CREEPS)
        this.myDamagedCreeps = this.myCreeps.filter((creep) => {
            return creep.hits < creep.hitsMax
        })

        this.assignedCreeps = _.filter(Game.creeps, (creep) => {
            return creep.memory[MEMORY_ASSIGN_ROOM] === room.name
        })

        this.numRepairers = _.filter(this.assignedCreeps, (creep) => {
            return creep.memory[MEMORY_ROLE] === WORKER_REPAIRER &&
                (creep.ticksToLive > (creep.memory[MEMORY.MEMORY_COMMUTE_DURATION] || 100))
        }).length

        // Construction sites will help decide how many builders we need
        this.numConstructionSites = room.find(FIND_CONSTRUCTION_SITES).length

        this.builders = _.filter(this.assignedCreeps, (creep) => {
            return creep.memory[MEMORY_ROLE] === WORKER_BUILDER &&
                (creep.ticksToLive > (creep.memory[MEMORY.MEMORY_COMMUTE_DURATION] || 100))
        })

        this.upgraders = _.filter(this.assignedCreeps, (creep) => {
            return creep.memory[MEMORY_ROLE] == WORKER_UPGRADER &&
                (creep.ticksToLive > (creep.memory[MEMORY.MEMORY_COMMUTE_DURATION] || 100))
        })

        this.hasStorage = this.getSpawns().reduce((containers, spawn) => {
            return containers.concat(spawn.pos.findInRange(FIND_STRUCTURES, 8, {
                filter: (structure) => {
                    return (structure.structureType == STRUCTURE_CONTAINER ||
                        structure.structureType == STRUCTURE_STORAGE);
                }
            }))
        }, []).length > 0

        this.distributors = _.filter(Game.creeps, (creep) => {
            return creep.memory[MEMORY_ROLE] === WORKER_DISTRIBUTOR &&
                creep.memory[MEMORY_ASSIGN_ROOM] === this.id &&
                creep.ticksToLive > 30
        })
        this.numDistributors = this.distributors.length

        // We want to know if the room has hostiles, request defenders or put room in safe mode
        let hostiles = room.find(FIND_HOSTILE_CREEPS)
        // TODO order hostiles by priority
        this.hostiles = hostiles
        this.numHostiles = this.hostiles.length

        // We want to know if our defenses are being attacked
        this.lowHitsDefenses = room.find(FIND_STRUCTURES).filter((s) => {
            if (s.structureType !== STRUCTURE_WALL && s.structureType !== STRUCTURE_RAMPART) {
                return false
            }

            return s.hits < 1000
        }).length

        let maxHits = 0
        let hits = 0
        let numStructures = 0
        room.find(FIND_STRUCTURES).forEach((s) => {
            if (s.structureType == STRUCTURE_WALL || s.structureType == STRUCTURE_RAMPART) {
                return
            }

            numStructures++

            if (s.hitsMax > 0 && s.hits > 0) {
                maxHits += s.hitsMax
                hits += s.hits
            }
        })
        let hitsPercentage = 1
        if (maxHits > 0) {
            hitsPercentage = hits / maxHits
        }
        this.hitsPercentage = hitsPercentage
        this.numStructures = numStructures
    }
    update() {
        let controller = this.gameObject.controller

        // If hostiles present spawn defenders and/or activate safe mode
        if (this.numHostiles) {
            // If there are defenses low on
            if (controller && controller.my && this.lowHitsDefenses && controller.safeModeAvailable &&
                !controller.safeMode && !controller.safeModeCooldown) {
                console.log("ACTIVATING SAFEMODE!!!!!")
                controller.activateSafeMode()
            } else {
                // Request defenders
                this.sendRequest(TOPIC_DEFENDERS, PRIORITY_DEFENDER, {
                    role: WORKER_DEFENDER,
                    memory: {
                        [MEMORY_ASSIGN_ROOM]: this.id
                    }
                })
            }
        }

        // Send a request if we are short on distributors
        if (this.hasStorage && this.numDistributors < MIN_DISTRIBUTORS) {
            this.sendRequest(TOPIC_SPAWN, PRIORITY_DISTRIBUTOR, {
                role: WORKER_DISTRIBUTOR,
                memory: {
                    [MEMORY_ASSIGN_ROOM]: this.id
                }
            })
        }

        // If not claimed by me and no claimer assigned and primary, request a claimer
        if (!this.claimedByMe && !this.hasClaimer && this.isPrimary) {
            if (this.getColony().spawns.length) {
                this.sendRequest(TOPIC_SPAWN, PRIORITY_CLAIMER, {
                    role: WORKER_CLAIMER,
                    memory: {
                        [MEMORY_ASSIGN_ROOM]: this.id
                    }
                })
            } else {
                this.getKingdom().sendRequest(TOPIC_SPAWN, PRIORITY_BOOTSTRAP + PRIORITY_CLAIMER + 1, {
                    role: WORKER_CLAIMER,
                    memory: {
                        [MEMORY_ASSIGN_ROOM]: this.id
                    }
                })
            }
        }

        // If not claimed by me and no claimer assigned and not primary, request a reserver
        if (!this.claimedByMe && !this.isPrimary && !this.hasReserver && this.reservationTicks < 1000) {
            if (this.getColony().spawns.length) {
                this.sendRequest(TOPIC_SPAWN, PRIORITY_RESERVER, {
                    role: WORKER_RESERVER,
                    memory: {
                        [MEMORY_ASSIGN_ROOM]: this.id
                    }
                })
            } else {
                this.getKingdom().sendRequest(TOPIC_SPAWN, PRIORITY_RESERVER + 1, {
                    role: WORKER_RESERVER,
                    memory: {
                        [MEMORY_ASSIGN_ROOM]: this.id
                    }
                })
            }
        }

        // Upgrader request
        let desiredUpgraders = MAX_UPGRADERS
        if (this.gameObject.storage) {
            desiredUpgraders = Math.ceil(this.gameObject.storage.store.getUsedCapacity(RESOURCE_ENERGY) / 25000)
        }

        if (this.isPrimary && this.upgraders.length < desiredUpgraders) {
            // As we get more upgraders, lower the priority
            let upgraderPriority = PRIORITY_UPGRADER - (this.upgraders.length * 2)

            // TODO this will need to be expanded to support
            // multiple claims

            if (this.getColony().spawns.length) {
                this.sendRequest(TOPIC_SPAWN, upgraderPriority, {
                    role: WORKER_UPGRADER,
                    memory: {
                        [MEMORY_ASSIGN_ROOM]: this.id
                    }
                })
            } else {
                this.getKingdom().sendRequest(TOPIC_SPAWN, PRIORITY_BOOTSTRAP + upgraderPriority, {
                    role: WORKER_UPGRADER,
                    memory: {
                        [MEMORY_ASSIGN_ROOM]: this.id
                    }
                })
            }
        }

        // Builder requests
        if (this.builders.length < Math.ceil(this.numConstructionSites / 15)) {
            if (this.getColony().spawns.length) {
                this.sendRequest(TOPIC_SPAWN, PRIORITY_BUILDER - (this.builders.length * 2), {
                    role: WORKER_BUILDER,
                    memory: {
                        [MEMORY_ASSIGN_ROOM]: this.id
                    }
                })
            } else {
                this.getKingdom().sendRequest(TOPIC_SPAWN, PRIORITY_BOOTSTRAP + PRIORITY_BUILDER - this.builders.length, {
                    role: WORKER_BUILDER,
                    memory: {
                        [MEMORY_ASSIGN_ROOM]: this.id
                    }
                })
            }
        }

        // Repairer requests
        let desiredRepairers = 0
        let repairerPriority = PRIORITY_REPAIRER
        if (this.hitsPercentage < 0.8) {
            desiredRepairers = 1
        }

        if (this.hitsPercentage < 0.6) {
            desiredRepairers = 2
            repairerPriority = PRIORITY_REPAIRER_URGENT
        }

        if (this.numStructures > 0 && this.numRepairers < desiredRepairers) {
            this.sendRequest(TOPIC_SPAWN, repairerPriority, {
                role: WORKER_REPAIRER,
                memory: {
                    [MEMORY_ASSIGN_ROOM]: this.id
                }
            })
        }

        console.log(this)

        this.links.forEach((link) => {
            link.update()
        })

        this.towers.forEach((tower) => {
            tower.update()
        })
    }
    process() {
        this.updateStats()

        this.links.forEach((link) => {
            link.process()
        })

        this.towers.forEach((tower) => {
            tower.process()
        })
    }
    toString() {
        return `-- Room - ID: ${this.id}, Primary: ${this.isPrimary}, Claimed: ${this.claimedByMe}, ` +
        `Claimers: ${this.hasClaimer}, #Builders: ${this.builders.length}, ` +
        `#Upgraders: ${this.upgraders.length}, #Hostiles: ${this.numHostiles}, ` +
        `#Towers: ${this.towers.length}, #Sites: ${this.numConstructionSites}, ` +
        `%Hits: ${this.hitsPercentage.toFixed(2)}, #Repairer: ${this.numRepairers}, ` +
        `#Links: ${this.links.length}, #Distributors: ${this.numDistributors}`
    }
    getRoom() {
        return this
    }
    getSources() {
        return this.gameObject.find(FIND_SOURCES)
    }
    getSpawns() {
        return this.gameObject.find(FIND_MY_SPAWNS)
    }
    getHostiles() {
        return this.hostiles
    }
    getMyCreeps() {
        return this.myCreeps
    }
    getClosestStoreWithEnergy(creep) {
        if (this.gameObject.storage) {
            return this.gameObject.storage.id
        }

        const container = creep.pos.findClosestByPath(FIND_STRUCTURES, {
            filter: (structure) => {
                return structure.structureType === STRUCTURE_CONTAINER &&
                    structure.store.getUsedCapacity(RESOURCE_ENERGY) > 0
            }
        })

        if (container) {
            return container.id
        }

        if (this.isPrimary) {
            return null
        }

        return this.getColony().primaryRoom.getClosestStoreWithEnergy(creep)
    }
    getMineralsWithExtractor() {
        const extractors = this.gameObject.find(FIND_STRUCTURES, {
            filter: (structure) => {
                return structure.structureType === STRUCTURE_EXTRACTOR
            }
        })

        return extractors.map((extractor) => {
            const minerals = extractor.pos.findInRange(FIND_MINERALS, 0)
            return minerals[0]
        })
    }
    updateStats() {
        const room = this.gameObject

        const roomStats = {
            sources: {}
        }

        roomStats.storageEnergy           = (room.storage ? room.storage.store.energy : 0);
        roomStats.terminalEnergy          = (room.terminal ? room.terminal.store.energy : 0);
        roomStats.energyAvailable         = room.energyAvailable;
        roomStats.energyCapacityAvailable = room.energyCapacityAvailable;
        roomStats.controllerProgress      = room.controller.progress;
        roomStats.controllerProgressTotal = room.controller.progressTotal;
        roomStats.controllerLevel         = room.controller.level;

        const stats = this.getStats()
        stats.colonies[this.getColony().id].rooms[this.id] = roomStats
    }
}

module.exports = Room
