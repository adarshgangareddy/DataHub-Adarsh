/**
 * An error that is safe to show to the client.
 * `cause` (optional) holds internal detail that is logged but never returned.
 */
export class AppError extends Error {
  constructor(status, code, message, { details, cause } = {}) {
    super(message);
    this.name = 'AppError';
    this.status = status;
    this.code = code;
    this.details = details;
    this.cause = cause;
  }
}

export const Errors = {
  authRequired: () => new AppError(401, 'AUTH_REQUIRED', 'Authentication required.'),
  invalidCredentials: () => new AppError(401, 'INVALID_CREDENTIALS', 'Incorrect username or password.'),
  forbidden: () => new AppError(403, 'FORBIDDEN', 'You do not have access to this device.'),
  deviceNotFound: () => new AppError(404, 'DEVICE_NOT_FOUND', 'Device not found.'),
  deviceOffline: () => new AppError(409, 'DEVICE_OFFLINE', 'The device is currently offline.'),
  brokerUnavailable: () =>
    new AppError(503, 'BROKER_UNAVAILABLE', 'Cannot reach the message broker. The command was not sent.'),
};
