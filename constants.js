'use strict';

const DataStatus = {
  EMPTY: Symbol('EMPTY'),
  FRESH: Symbol('FRESH'),
  STALE: Symbol('STALE'),
  PENDING_PUT: Symbol('PENDING_PUT'),
  PENDING_POST: Symbol('PENDING_POST'),
  PENDING_DELETE: Symbol('PENDING_DELETE'),
  ERROR: Symbol('ERROR')
};

const DEFAULT_CACHE_TTL = 60 * 1000;
const DEFAULT_REQUEST_TIMEOUT = 30000;

module.exports = {
  DataStatus,
  DEFAULT_CACHE_TTL,
  DEFAULT_REQUEST_TIMEOUT
}
