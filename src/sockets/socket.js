import { Server } from "socket.io";
import jwt from "jsonwebtoken";
import { Member } from "../modules/members/member.model.js";

let io;

export const initSocket = (server) => {
  io = new Server(server, {
    cors: {
      origin: "*",
    },
  });

  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth?.token;

      if (!token) {
        return next(new Error("Not authorized"));
      }

      const decoded = jwt.verify(token, process.env.JWT_SECRET);

      const userId = decoded.id;
      socket.data.userId = userId;

      const member = await Member.findOne({
        userId,
        status: "ACTIVE",
      }).select("ownerId role");

      if (member) {
        socket.data.ownerId = member.ownerId.toString();
        socket.data.contextRole = member.role;
      } else {
        socket.data.ownerId = userId;
        socket.data.contextRole = "OWNER";
      }

      return next();
    } catch (err) {
      return next(new Error("Not authorized"));
    }
  });

  io.on("connection", (socket) => {
    const ownerId = socket.data.ownerId;
    if (ownerId) {
      socket.join(`owner:${ownerId}`);
    }

    console.log(
      `Socket connected: ${socket.id} user:${socket.data.userId} owner:${ownerId}`
    );

    socket.on("disconnect", () => {
      console.log("Socket disconnected:", socket.id);
    });
  });
};

export const getIO = () => {
  if (!io) {
    throw new Error("Socket.io not initialized");
  }
  return io;
};
