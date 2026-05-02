const crypto = require("crypto");
const express = require("express");
const mongoose = require("mongoose");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;
const MONGO_URI =
  process.env.MONGO_URI || "mongodb://127.0.0.1:27017/url_shortener";

mongoose
  .connect(MONGO_URI)
  .then(() => console.log("MongoDB connected"))
  .catch((error) => {
    console.error("MongoDB connection error:", error.message);
    process.exit(1);
  });

const urlSchema = new mongoose.Schema(
  {
    originalUrl: {
      type: String,
      required: true,
      trim: true,
    },
    shortCode: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    clicks: {
      type: Number,
      default: 0,
    },
  },
  { timestamps: true }
);

const Url = mongoose.model("Url", urlSchema);

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

function isValidHttpUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

async function generateShortCode() {
  let shortCode;
  let exists = true;

  while (exists) {
    shortCode = crypto.randomBytes(4).toString("base64url").slice(0, 6);
    exists = await Url.exists({ shortCode });
  }

  return shortCode;
}

app.get("/", async (req, res) => {
  const urls = await Url.find().sort({ createdAt: -1 }).limit(10);
  res.render("index", {
    urls,
    shortUrl: null,
    error: null,
    baseUrl: `${req.protocol}://${req.get("host")}`,
  });
});

app.post("/shorten", async (req, res) => {
  const { originalUrl } = req.body;
  const baseUrl = `${req.protocol}://${req.get("host")}`;

  if (!isValidHttpUrl(originalUrl)) {
    const urls = await Url.find().sort({ createdAt: -1 }).limit(10);
    return res.status(400).render("index", {
      urls,
      shortUrl: null,
      error: "Please enter a valid URL that starts with http:// or https://",
      baseUrl,
    });
  }

  const existingUrl = await Url.findOne({ originalUrl });
  const url =
    existingUrl ||
    (await Url.create({
      originalUrl,
      shortCode: await generateShortCode(),
    }));

  const urls = await Url.find().sort({ createdAt: -1 }).limit(10);
  return res.render("index", {
    urls,
    shortUrl: `${baseUrl}/${url.shortCode}`,
    error: null,
    baseUrl,
  });
});

app.get("/:shortCode", async (req, res) => {
  const url = await Url.findOneAndUpdate(
    { shortCode: req.params.shortCode },
    { $inc: { clicks: 1 } },
    { new: true }
  );

  if (!url) {
    return res.status(404).send("Short URL not found");
  }

  return res.redirect(url.originalUrl);
});

app.listen(PORT, () => {
  console.log(`URL shortener running at http://localhost:${PORT}`);
});
