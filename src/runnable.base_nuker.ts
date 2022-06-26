import * as MEMORY from "./constants.memory";
import * as PRIORITIES from "./constants.priorities";
import * as TASKS from "./constants.tasks";
import * as TOPICS from "./constants.topics";
import {Tracer} from './lib.tracing';
import {Kingdom} from "./org.kingdom";
import OrgRoom from "./org.room";
import {sleeping, terminate} from "./os.process";
import {RunnableResult} from "./os.runnable";
import {getBaseDistributorTopic} from "./topics";

const REQUEST_RESOURCES_TTL = 25;

export default class NukerRunnable {
  baseId: string;
  orgRoom: OrgRoom;
  id: Id<StructureNuker>;

  damagedCreep: Id<Creep>;

  haulTTL: number;
  prevTime: number;

  constructor(baseId: string, room: OrgRoom, tower: StructureNuker) {
    this.baseId = baseId;
    this.orgRoom = room;

    this.id = tower.id;
    this.haulTTL = 0;
    this.prevTime = Game.time;
  }

  run(kingdom: Kingdom, trace: Tracer): RunnableResult {
    trace = trace.begin('nuker_run');

    const ticks = Game.time - this.prevTime;
    this.prevTime = Game.time;

    this.haulTTL -= ticks;

    const room = this.orgRoom.getRoomObject()
    if (!room) {
      trace.end();
      return terminate();
    }

    const nuker = Game.getObjectById(this.id);
    if (!nuker) {
      trace.end();
      return terminate();
    }

    if (!nuker.isActive()) {
      trace.end();
      return sleeping(100);
    }

    let readyToFire = !nuker.cooldown;

    const neededEnergy = nuker.store.getFreeCapacity(RESOURCE_ENERGY);
    if (neededEnergy > 0) {
      trace.log('need energy', {neededEnergy});
      this.requestResource(kingdom, RESOURCE_ENERGY, neededEnergy, trace);
      readyToFire = false;
    }

    const neededGhodium = nuker.store.getFreeCapacity(RESOURCE_GHODIUM);
    if (neededGhodium > 0) {
      trace.log('need ghodium', {neededGhodium});
      this.requestResource(kingdom, RESOURCE_GHODIUM, neededGhodium, trace);
      readyToFire = false;
    }

    if (readyToFire) {
      trace.log('lets play global thermonuclear war');

      const request = (kingdom as any).getNextRequest(TOPICS.NUKER_TARGETS);
      if (request) {
        const positionStr = request.details.position;
        const posArray = positionStr.split(',');

        let position: RoomPosition = null;
        if (posArray && posArray.length === 3) {
          position = new RoomPosition(posArray[0], posArray[1], posArray[2]);
        } else {
          trace.log('problem with position string', {positionStr});
        }

        if (position !== null) {
          trace.log('would nuke', {position});
          const result = nuker.launchNuke(position);
          trace.notice('nuker launch result', {result, position});
        }
      }
    }

    trace.end();

    return sleeping(REQUEST_RESOURCES_TTL);
  }

  requestResource(kingdom: Kingdom, resource: ResourceConstant, amount: number, trace: Tracer) {
    const pickup = this.orgRoom.getReserveStructureWithMostOfAResource(resource, true);
    if (!pickup) {
      trace.log('unable to get resource from reserve', {resource, amount});

      trace.log('requesting resource from governor', {resource, amount});
      const resourceGovernor = (this.orgRoom as any).getKingdom().getResourceGovernor();

      const requested = resourceGovernor.requestResource(this.orgRoom, resource, amount, REQUEST_RESOURCES_TTL, trace);
      if (!requested) {
        resourceGovernor.buyResource(this.orgRoom, resource, amount, REQUEST_RESOURCES_TTL, trace);
      }

      return;
    }

    trace.log('requesting load', {
      nuker: this.id,
      resource: resource,
      amount: amount,
      pickup: pickup.id,
      ttl: REQUEST_RESOURCES_TTL,
    });

    kingdom.sendRequest(getBaseDistributorTopic(this.baseId), PRIORITIES.HAUL_NUKER, {
      [MEMORY.TASK_ID]: `load-${this.id}-${Game.time}`,
      [MEMORY.MEMORY_TASK_TYPE]: TASKS.TASK_HAUL,
      [MEMORY.MEMORY_HAUL_PICKUP]: pickup.id,
      [MEMORY.MEMORY_HAUL_RESOURCE]: resource,
      [MEMORY.MEMORY_HAUL_AMOUNT]: amount,
      [MEMORY.MEMORY_HAUL_DROPOFF]: this.id,
    }, REQUEST_RESOURCES_TTL);
  }
}
