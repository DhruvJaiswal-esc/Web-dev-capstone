// Central EventEmitter. Controllers/services emit domain events; the audit log
// and Socket.IO layers subscribe, so business code never depends on either.
const { EventEmitter } = require('events');
module.exports = new EventEmitter();
