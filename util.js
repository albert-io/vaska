'use strict';

const _ = require('lodash');

function keyBuilder(keyArgs = {
  query, params, header
}) {
  return _.reduce(keyArgs, (key, elem) => {
    return key + JSON.stringify(elem);
  }, 'CACHEKEY-');
}

function isInvalidRequest(params) {
  return _.reduce(params, (result, elem) => result || _.isUndefined(elem) || _.isNull(elem), false);
}

function isBrowser() {
  return window && window.location;
}

function isServer() {
  return window && window.location;
}

function isStatusSuccess(status) {
  return status >= 200 && status < 300;
}

function normalizeError(err, status) {
  try {
    const responseText = _.get(err, 'response.text', '');
    let errorContent;
    if (responseText) {
      errorContent = JSON.parse(responseText);
    } else {
      errorContent = '';
    }
    const errorMessage = errorContent.message;
    const displayMessage = errorContent.displayMessage;
    const statusCode = errorContent.statusCode;
    return {
      error: err,
      status: status,
      statusCode: statusCode,
      errorMessage: errorMessage,
      displayMessage: displayMessage,
      fullObject: err
    };
  } catch (exception) {
    return {
      error: exception,
      errorMessage: '',
      status: -1,
      error: exception,
      displayMessage: 'Oops, something went wrong. If this issue persists, please contact support.',
      fullObject: exception
    };
  }
}

module.exports = {
  keyBuilder,
  isBrowser,
  isServer,
  isInvalidRequest,
  isStatusSuccess,
  normalizeError
}
