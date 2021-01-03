// General role memory IDs
module.exports.MEMORY_ROLE = 'role';

// Old source memory ID (deprecated)
module.exports.MEMORY_SOURCE = 'source';
module.exports.MEMORY_SOURCE_ROOM = 'source';

// General movement memory IDs (use this for nearly all movement)
module.exports.MEMORY_DESTINATION = 'destination';
module.exports.MEMORY_DESTINATION_ROOM = 'destination_room';

// Long term memory IDs
module.exports.MEMORY_HARVEST = 'harvest';
module.exports.MEMORY_HARVEST_CONTAINER = 'harvest_container';
module.exports.MEMORY_HARVEST_ROOM = 'harvest_room';
module.exports.MEMORY_WITHDRAW = 'withdraw';
module.exports.MEMORY_WITHDRAW_ROOM = 'withdraw_room';
module.exports.MEMORY_DROPOFF = 'transfer';
module.exports.MEMORY_CLAIM = 'claim';
module.exports.MEMORY_RESERVE = 'reserve';
module.exports.MEMORY_ORIGIN = 'origin';
module.exports.MEMORY_FLAG = 'flag';
module.exports.MEMORY_ASSIGN_ROOM = 'assignment_room';
module.exports.MEMORY_COLONY = 'colony';
module.exports.MEMORY_START_TICK = 'start_tick';
module.exports.MEMORY_COMMUTE_DURATION = 'commute_duration';

// base task
module.exports.MEMORY_TASK_REQUESTER = 'task_requestor';
module.exports.MEMORY_TASK_TYPE = 'task_type';
module.exports.MEMORY_TASK_REASON = 'task_reason';

// haul task
module.exports.MEMORY_HAUL_PICKUP = 'haul_pickup';
module.exports.MEMORY_HAUL_RESOURCE = 'haul_resource';
module.exports.MEMORY_HAUL_AMOUNT = 'haul_amount';
module.exports.MEMORY_HAUL_DROPOFF = 'haul_dropoff';

// terminal
module.exports.TERMINAL_TASK = 'terminal_task';
module.exports.TERMINAL_TASK_TYPE = 'terminal_task_type';

// buy/sell task
module.exports.MEMORY_ORDER_TYPE = 'order_type';
module.exports.MEMORY_ORDER_RESOURCE = 'order_resource';
module.exports.MEMORY_ORDER_AMOUNT = 'order_amount';

// transfer task
module.exports.MEMORY_TRANSFER_ROOM = 'transfer_room';
module.exports.MEMORY_TRANSFER_DESTINATION = 'transfer_destination';
module.exports.MEMORY_TRANSFER_RESOURCE = 'order_resource';
module.exports.MEMORY_TRANSFER_AMOUNT = 'order_amount';

// Attacker
module.exports.MEMORY_ATTACK = 'attack';
module.exports.MEMORY_HEAL = 'heal';
module.exports.MEMORY_POSITION_X = 'position_x';
module.exports.MEMORY_POSITION_Y = 'position_y';
module.exports.MEMORY_POSITION_ROOM = 'position_room';

// PID Controller prefixes
module.exports.PID_PREFIX_HAULERS = 'haulers_';

// PID Controller suffixes
module.exports.PID_SUFFIX_P = 'pid_p';
module.exports.PID_SUFFIX_I = 'pid_i';
module.exports.PID_SUFFIX_D = 'pid_d';
module.exports.PID_SUFFIX_INTEGRAL = 'pid_integral';
module.exports.PID_SUFFIX_TIME = 'pid_time';
module.exports.PID_SUFFIX_ERROR = 'pid_error';
module.exports.PID_SUFFIX_SETPOINT = 'pid_setpoint';

// Room state
module.exports.ROOM_DAMAGED_STRUCTURES_LIST = 'damaged_structure_list';
module.exports.ROOM_DAMAGED_STRUCTURES_TIME = 'damaged_structure_time';
module.exports.ROOM_NEEDS_ENERGY_LIST = 'needs_energy_list';
module.exports.ROOM_NEEDS_ENERGY_TIME = 'needs_energy_time';