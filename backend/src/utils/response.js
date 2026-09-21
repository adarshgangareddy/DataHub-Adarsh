// Every API response uses one of these two shapes.

export function ok(res, data = {}, status = 200) {
  return res.status(status).json({ success: true, data });
}

export function errorBody(code, message, details) {
  const error = { code, message };
  if (details !== undefined) error.details = details;
  return { success: false, error };
}
