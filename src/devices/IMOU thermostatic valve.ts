const fz = require('zigbee-herdsman-converters/converters/fromZigbee');
const tz = require('zigbee-herdsman-converters/converters/toZigbee');
const exposes = require('zigbee-herdsman-converters/lib/exposes');
const e = exposes.presets;
const ea = exposes.access;
const { deviceEndpoints, battery, onOff } = require('zigbee-herdsman-converters/lib/modernExtend');

const { Zcl } = require('zigbee-herdsman');

// Precision round function for temperature conversion
const precisionRound = (number, precision) => {
    const factor = Math.pow(10, precision);
    return Math.round(number * factor) / factor;
};

// Custom converter for the hvacThermostat cluster (fromZigbee)
fz.hvacThermostat = {
    cluster: 'hvacThermostat',
    type: ['attributeReport', 'readResponse'],
    convert: (model, msg, publish, options, meta) => {
        const result = {};
        if ("occupiedHeatingSetpoint" in msg.data) {
            const setpoint = precisionRound(msg.data['occupiedHeatingSetpoint'], 2) / 100;
            console.log(`OccupiedHeatingSetpoint received: ${setpoint}°C`);
            result.occupiedHeatingSetpoint = setpoint;
        }
        if ("localTemp" in msg.data) {
            const temperature = precisionRound(msg.data['localTemp'], 2) / 100;
            console.log(`LocalTemp received: ${temperature}°C`);
            result.temperature = temperature;
        }
        if ("systemMode" in msg.data) {
            const mode = msg.data['systemMode'] === 4 ? 'heat' : 'off';
            console.log(`systemMode received: ${mode}`);
            result.systemMode = mode;
        }
        return result;
    },
};

fz.heimanSpecificScenes = {
    cluster: 'heimanSpecificScenes',
    type: ['attributeReport', 'readResponse'],
    convert: (model, msg, publish, options, meta) => {
        const result = {};
        if ("32768" in msg.data) {
            const childLockState = msg.data["32768"] === 1 ? 'ON' : 'OFF';
            console.log(`Child Lock state received: ${childLockState}`);
            result.child_lock = childLockState;
            publish(result);
        }
        return result;
    },
};

// Custom converter for setting the heating setpoint (toZigbee)
tz.setOccupiedHeatingSetpoint = {
    key: ['occupiedHeatingSetpoint'],
    convertSet: async (entity, key, value, meta) => {
        const setpointInHundredths = Math.round(value * 100);
        console.log(`Setting OccupiedHeatingSetpoint to: ${setpointInHundredths}`);
        await entity.write('hvacThermostat', { occupiedHeatingSetpoint: setpointInHundredths }, {});
    },
};

// Custom converter for setting systemMode (toZigbee)
tz.setSystemMode = {
    key: ['systemMode'],
    convertSet: async (entity, key, value, meta) => {
        const modeValue = value === 'heat' ? 4 : 0; // 4 = Heat, 0 = Off
        console.log(`Setting systemMode to: ${value} (${modeValue})`);
        await entity.write('hvacThermostat', { systemMode: modeValue }, {});
    },
};

tz.heimanSpecificScenes = {
    key: ['child_lock'],
    convertSet: async (entity, key, value, meta) => {
        try {
            if (value !== 'ON' && value !== 'OFF') {
                throw new Error(`Invalid value for child lock: ${value}`);
            }
            const childLockState = value === 'ON' ? 1 : 0;
            console.log(`Set Child Lock status to: ${childLockState}`);
            const payload = {
                32768: {
                    value: childLockState, 
                    type: 0x10
                }
            };
            const options = {
                manufacturerCode: 4905,
                disableDefaultResponse: true
            };
            console.log('Payload inviato:', payload);
            console.log('Opzioni:', options);
            await entity.write(64640, payload, options);
            console.log('Write command successfully completed!');
        } catch (error) {
            console.error('Error during writing:', error.message);
        }
    }
};

// Exposing the thermostat attributes
const hvacThermostatExpose = [
    exposes.numeric('occupiedHeatingSetpoint', ea.STATE_SET)
        .withUnit('°C')
        .withValueMin(5)
        .withValueMax(35)
        .withValueStep(0.5)
        .withDescription('Occupied Heating Setpoint in degrees Celsius'),
    exposes.numeric('temperature', ea.STATE)
        .withValueMin(-30)
        .withValueMax(100)
        .withValueStep(0.5)
        .withUnit('°C')
        .withDescription('Local Temperature in degrees Celsius'),
    exposes.enum('systemMode', ea.STATE_SET, ['off', 'heat'])
        .withDescription('System Mode: "off" or "heat"'),
];

// Exposing the child lock as a read-only text field
const childLockExpose = e.binary('child_lock', ea.STATE_SET, 'ON', 'OFF')
    .withLabel('Child Lock')
    .withDescription('Enable or disable the child lock (ON/OFF)')

// Device definition
const definition = {
    zigbeeModel: ['TRV602WZ'],
    model: 'TRV602WZ',
    vendor: 'IMOU',
    icon: '/config/www/Photos/ASSET_MMS_146042091.png',
    description: 'Automatically generated definition',
    extend: [
        deviceEndpoints({ "endpoints": { "1": 1, "2": 2 } }),
        battery(),
        onOff({"powerOnBehavior":false}),
    ],
    meta: { "multiEndpoint": true },
    exposes: [
        ...hvacThermostatExpose,
        childLockExpose,
    ],
    fromZigbee: [
        fz.hvacThermostat,
        fz.heimanSpecificScenes,
    ],
    toZigbee: [
        tz.setOccupiedHeatingSetpoint,
        tz.setSystemMode,
        tz.heimanSpecificScenes,
    ],
};

module.exports = definition;
