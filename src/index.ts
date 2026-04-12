import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import authRoutes from "./routes/auth";
import farmerRoutes from "./routes/farmers";
import fieldRoutes from "./routes/fields";
import alertRoutes from "./routes/alerts";
import userRoutes from "./routes/users";
import contentRoutes from "./routes/content";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

app.use(
  cors({
    origin: function (origin, callback) {
      // Allow requests with no origin (mobile apps, curl, Thunder Client)
      if (!origin) return callback(null, true);

      // Allow any localhost port during development
      if (origin.startsWith("http://localhost:")) {
        return callback(null, true);
      }

      // In production, restrict to your actual domains
      const allowedOrigins = [
        process.env.FARMER_APP_URL || "http://localhost:5179",
        process.env.ADMIN_URL || "http://localhost:5174",
      ];

      if (allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error("Not allowed by CORS"));
      }
    },
    credentials: true,
  }),
);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.get("/health", (_req, res) => {
  res.json({ status: "AgroFlow+ backend is running", timestamp: new Date() });
});

app.use("/api/auth", authRoutes);
app.use("/api/farmers", farmerRoutes);
app.use("/api/fields", fieldRoutes);
app.use("/api/alerts", alertRoutes);
app.use("/api/users", userRoutes);
app.use("/api/content", contentRoutes);

app.use((_req, res) => {
  res.status(404).json({ error: "Route not found" });
});

app.use(
  (
    err: Error,
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction,
  ) => {
    console.error(err.stack);
    res
      .status(500)
      .json({ error: "Something went wrong", message: err.message });
  },
);

app.listen(PORT, () => {
  console.log(`🌱 AgroFlow+ backend running on http://localhost:${PORT}`);
});

export default app;
