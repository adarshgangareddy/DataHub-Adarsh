// Holds the active transport (real MQTT client or the development mock) so services can publish
// without importing the MQTT client directly. Both implement: publish(), isConnected(), close().
let active = null;

export const setTransport = (transport) => {
  active = transport;
};

export const getTransport = () => {
  if (!active) throw new Error('MQTT transport has not been started');
  return active;
};
