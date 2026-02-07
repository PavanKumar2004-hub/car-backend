import dotenv from "dotenv";
dotenv.config();

import http from "http";
import app from "./app.js";
import { connectDB } from "./config/db.js";
import { initSocket } from "./sockets/socket.js";

import "./services/mqtt/mqtt.client.js";

const PORT = process.env.PORT || 5000;

const server = http.createServer(app);

connectDB();
initSocket(server);

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
