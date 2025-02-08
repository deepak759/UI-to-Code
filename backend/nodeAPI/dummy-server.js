const express = require("express");
const cors = require("cors");
const multer = require("multer");
require("dotenv").config();

const app = express();
app.use(express.json());
app.use(cors());

// Configure multer for handling file uploads
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, "uploads/");
  },
  filename: function (req, file, cb) {
    cb(null, Date.now() + "-" + file.originalname);
  },
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 5 * 1024 * 1024,
  },
});

// Dummy endpoint that returns a sample HTML/CSS response
app.post("/api/dummy-generate", upload.single("image"), async (req, res) => {
  try {
    const { prompt } = req.body;

    // Simulate processing delay
    await new Promise((resolve) => setTimeout(resolve, 1000));

    // Sample response with HTML and CSS
    const dummyResponse = `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          .container {
            max-width: 1200px;
            margin: 0 auto;
            padding: 20px;
          }
          .hero {
            text-align: center;
            padding: 50px 0;
          }
          .hero img {
            max-width: 100%;
            height: auto;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="hero">
            <h1>Welcome to Our Website</h1>
            <img src="placeholder.jpg" alt="nature landscape" />
            <p>This is a sample response for prompt: "${prompt}"</p>
          </div>
          <div class="features">
            <img src="feature1.jpg" alt="mountain view" />
            <img src="feature2.jpg" alt="ocean waves" />
          </div>
        </div>
      </body>
      </html>
    `;

    res.json({ response: dummyResponse });
  } catch (error) {
    console.error("Error:", error);
    res.status(500).json({ error: "Failed to generate dummy content" });
  }
});

const PORT = 3001;
app.listen(PORT, () => {
  console.log(`Dummy server running on port ${PORT}`);
});
