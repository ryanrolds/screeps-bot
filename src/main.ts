import * as tracing from './lib.tracing';
import {AI} from './lib.ai';
import {KingdomConfig} from './config'

global.TRACING_ACTIVE = false;

let config: KingdomConfig = {
  'username': 'ENETDOWN',
  'buffer': 3,
  'friends': [
    'PythonBeatJava',
    'ChaosDMG',
  ],
  'neutral': [
    'JavaXCrow',
    'likeafox',
    'kobez0r',
  ],
  'avoid': [],
  'kos': [],
  'shards': {
    'shard0': {},
    'shard1': {},
    'shard2': {
      'E21S48-Shard2': {
        id: 'E21S48-Shard2',
        primary: 'E21S48',
        isPublic: false,
        rooms: ['E21S48'],
      },
      'E22S48-Shard2': {
        id: 'E22S48-Shard2',
        primary: 'E22S48',
        isPublic: false,
        rooms: ['E22S48', 'E22S47', 'E22S46', 'E21S46'],
      },
      'E22S49-Shard2': {
        id: 'E22S49-Shard2',
        primary: 'E22S49',
        isPublic: false,
        rooms: ['E22S49'],
      }/*,
      'E23S45-Shard2': {
        id: 'E23S45-Shard2',
        primary: 'E23S45',
        isPublic: false,
        rooms: ['E23S45'],
      },
      'E23S47-Shard2': {
        id: 'E23S47-Shard2',
        primary: 'E23S47',
        isPublic: false,
        rooms: ['E23S47'],
      },
      'E21S45-Shard2': {
        id: 'E21S45-Shard2',
        primary: 'E21S45',
        isPublic: false,
        rooms: ['E21S45'],
      }
      'E21S46-Shard2': {
        id: 'E21S46-Shard2',
        primary: 'E21S46',
        isPublic: false,
        rooms: ['E21S46'],
      }'E17S51-Shard2': {
        id: 'E17S51-Shard2',
        primary: 'E17S51',
        isPublic: false,
        rooms: ['E17S51', 'E16S51', 'E18S51'],
      },*/
    },
    'shard3': {
      'E18S48-Shard3': {
        id: 'E18S48-Shard3',
        primary: 'E18S48',
        isPublic: false,
        rooms: ['E18S48'],
      },
      'E18S47-Shard3': {
        id: 'E18S47-Shard3',
        primary: 'E18S47',
        isPublic: false,
        rooms: ['E18S47'],
        // rooms: ['E18S47', 'E19S46'],
      },
      'E18S45-Shard3': {
        id: 'E18S45-Shard3',
        primary: 'E18S45',
        isPublic: false,
        rooms: ['E18S45'],
      },
      'E17S49-Shard3': {
        id: 'E17S49-Shard3',
        primary: 'E17S49',
        isPublic: false,
        rooms: ['E17S49'],
      },
      'E15S48-Shard3': {
        id: 'E15S48-Shard3',
        primary: 'E15S48',
        isPublic: false,
        rooms: ['E15S48'],
        // rooms: ['E15S48', 'E16S48', 'E14S48'],
      },
      'E12S49-Shard3': {
        id: 'E12S49-Shard3',
        primary: 'E12S49',
        isPublic: false,
        rooms: ['E12S49'],
        //rooms: ['E12S49', 'E13S49'],
      },
      'E19S51-Shard3': {
        id: 'E19S51-Shard3',
        primary: 'E19S51',
        isPublic: false,
        rooms: ['E19S51'],
      },
    },
    'DESKTOP-I28ILK0': {
      'W8N4-Private': {
        id: 'W8N4-Private',
        primary: 'W8N4',
        isPublic: false,
        rooms: ['W8N4', 'W7N4', 'W7N3', /*'W8N5', 'W9N5', 'W9N4', 'W8N3', 'W7N5', 'W9N3'*/],
      },
    }
  },
};

console.log('***** STARTING AI *****');
const ai = new AI(config);
global.AI = ai; // So we can access it from the console

export const loop = function () {
  const trace = new tracing.Tracer('loop', 'loop');

  if (global.TRACING_ACTIVE === true) {
    tracing.setActive();
  } else {
    tracing.setInactive();
  }

  console.log('======== TICK', Game.time, Game.shard.name, '========');

  const aiTrace = trace.begin('ai');
  ai.tick(aiTrace);
  aiTrace.end();

  // console.log('--------------------------------');

  trace.end();
  tracing.report();
};
