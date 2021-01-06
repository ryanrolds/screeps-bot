const roleHarvester = require('./role.harvester');
const roleUpgrader = require('./role.upgrader');
const roleBuilder = require('./role.builder');
const roleRepairer = require('./role.repairer');
const roleHauler = require('./role.hauler');
const roleMiner = require('./role.miner');
const roleDistributor = require('./role.distributor');
const roleDefender = require('./role.defender');
const roleClaimer = require('./role.claimer');
const roleAttacker = require('./role.attacker');
const roleReserver = require('./role.reserver');

const CREEPS = require('./constants.creeps');
const MEMORY = require('./constants.memory');

const {definitions} = require('./constants.creeps');
const {MEMORY_ROLE, MEMORY_ORIGIN, MEMORY_COLONY} = require('./constants.memory');

const MIN_BUCKET_THROTTLE = 1000;

module.exports.tick = (kingdom, trace) => {
  // Take modulus of tick to give us an offset so that we don't always skip
  // the same 20%
  let skipCount = Game.time % 5;

  _.each(Game.creeps, (creep) => {
    if (creep.spawning) {
      return;
    }

    skipCount++;

    // TODO move the below to a map and/or lookup function

    if (creep.memory.role == CREEPS.WORKER_ATTACKER) {
      roleAttacker.run(creep, trace, kingdom);
    }

    if (creep.memory.role == CREEPS.WORKER_MINER ||
      creep.memory.role == CREEPS.WORKER_REMOTE_MINER) {
      roleMiner.run(creep, trace, kingdom);
    }

    if (creep.memory.role == CREEPS.WORKER_HARVESTER ||
      creep.memory.role == CREEPS.WORKER_REMOTE_HARVESTER) {
      roleHarvester.run(creep, trace, kingdom);
    }

    if (creep.memory.role == CREEPS.WORKER_DISTRIBUTOR) {
      roleDistributor.run(creep, trace, kingdom);
    }

    if (creep.memory.role == CREEPS.WORKER_DEFENDER) {
      roleDefender.run(creep, trace, kingdom);
    }

    // If we are running low on CPU start skipping 20% of non-essential creeps
    if (Game.cpu.bucket < MIN_BUCKET_THROTTLE) {
      if (skipCount % 5 === 0) {
        console.log('skipping', creep.name);
        return;
      }
    }

    if (creep.memory.role == CREEPS.WORKER_UPGRADER) {
      roleUpgrader.run(creep, trace, kingdom);
    }

    if (creep.memory.role == CREEPS.WORKER_BUILDER) {
      roleBuilder.run(creep, trace, kingdom);
    }

    if (creep.memory.role == CREEPS.WORKER_REPAIRER) {
      roleRepairer.run(creep, trace, kingdom);
    }

    if (creep.memory.role == CREEPS.WORKER_HAULER) {
      roleHauler.run(creep, trace, kingdom);
    }

    if (creep.memory.role == CREEPS.WORKER_RESERVER ||
      creep.memory.role == CREEPS.WORKER_CLAIMER) {
      roleReserver.run(creep, trace, kingdom);
    }
  });

  if (Game.time % 100 === 0) {
    // Cleanup old creep memory
    let numCleanedUp = 0;
    for (const i in Memory.creeps) {
      if (!Game.creeps[i]) {
        delete Memory.creeps[i];
        numCleanedUp++;
      }
    }

    console.log('Cleaning up creeps', numCleanedUp);
  }
};

module.exports.createCreep = (colony, room, spawn, role, memory, energy, energyLimit) => {
  const definition = definitions[role];

  const ignoreSpawnEnergyLimit = definition.ignoreSpawnEnergyLimit || false;
  const roleEnergyLimit = definition.energyLimit;
  if (roleEnergyLimit && energy > roleEnergyLimit) {
    energy = roleEnergyLimit;
  }

  if (energy > energyLimit && !ignoreSpawnEnergyLimit) {
    energy = energyLimit;
  }

  const parts = getBodyParts(definition, energy);

  const name = role + '_' + Game.time;
  memory[MEMORY_COLONY] = colony;
  memory[MEMORY_ORIGIN] = room;
  memory[MEMORY_ROLE] = role;
  memory[MEMORY.MEMORY_START_TICK] = Game.time;

  console.log(`==== Creating creep ${colony}, ${room}, ${role}, ${parts}, ${JSON.stringify(memory)}`);

  const result = spawn.spawnCreep(parts, name, {memory});
  console.log('spawn result', result, parts.length);

  return result;
};

function getBodyParts(definition, maxEnergy) {
  let base = definition.base.slice(0);
  let i = 0;

  while (true) {
    const nextPart = definition.parts[i % definition.parts.length];
    const estimate = base.concat([nextPart]).reduce((acc, part) => {
      return acc + BODYPART_COST[part];
    }, 0);

    if (estimate <= maxEnergy && base.length < 50) {
      base.push(nextPart);
    } else {
      break;
    }

    i++;
  }

  base = _.sortBy(base, (part) => {
    switch (part) {
      case TOUGH:
        return 0;
      case WORK:
      case CARRY:
        return 1;
      case MOVE:
        return 2;
      case ATTACK:
        return 8;
      case RANGED_ATTACK:
        return 9;
      case HEAL:
        return 10;
      default:
        return 1;
    }
  });

  return base;
}
