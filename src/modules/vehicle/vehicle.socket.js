import { getIO } from "../../sockets/socket.js";

export const toVehicleDevice = (vehicle) => {
  if (!vehicle) return null;
  return {
    _id: vehicle._id,
    vehicleId: vehicle.vehicleId,
    name: vehicle.name,
    plateNumber: vehicle.plateNumber,
    createdAt: vehicle.createdAt,
  };
};

export const emitActiveVehicleUpdate = (ownerId, activeVehicle) => {
  try {
    const io = getIO();
    io.to(`owner:${ownerId.toString()}`).emit("activeVehicle:update", {
      ownerId: ownerId.toString(),
      activeVehicle: toVehicleDevice(activeVehicle),
    });
  } catch {
    // socket not available (e.g., during boot/tests)
  }
};

