const express = require("express");
const { GoogleGenerativeAI } = require("@google/generative-ai");
const cors = require("cors");
const path = require("path");
const { createClient } = require("pexels");
const multer = require("multer");
require("dotenv").config();
const fs = require("fs").promises;

const app = express();
app.use(express.json());
app.use(cors());

// Configure multer for handling file uploads
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, "uploads/"); // Make sure this directory exists
  },
  filename: function (req, file, cb) {
    cb(null, Date.now() + "-" + file.originalname);
  },
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit
  },
});

// Initialize Google AI
const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

// Initialize Pexels client
const pexelsClient = createClient(process.env.PEXELS_API_KEY);

// Function to fetch image URL from Pexels
async function getPexelsImageUrl(query) {
  try {
    const result = await pexelsClient.photos.search({
      query,
      per_page: 1,
    });

    if (result.photos && result.photos.length > 0) {
      return result.photos[0].src.original;
    }
    // Return Cloudinary default image instead of local path
    return "https://res.cloudinary.com/drcuajyy6/image/upload/v1738916681/defaultImage_b3t8ll.jpg";
  } catch (error) {
    console.error("Error fetching from Pexels:", error);
    // Return Cloudinary default image on error
    return "https://res.cloudinary.com/drcuajyy6/image/upload/v1738916681/defaultImage_b3t8ll.jpg";
  }
}

app.post("/api/generate", upload.single("image"), async (req, res) => {
  try {
    const userMessage = req.body.message || "";
    const conversationHistory = req.body.history
      ? JSON.parse(req.body.history)
      : [];

    let prompt;

    // Case 1: Initial image upload (no history)
    if (req.file && conversationHistory.length === 0) {
      prompt =
        "Create responsive HTML and CSS code that matches this UI image. Include all necessary styling and layout. Make it fully functional and visually identical to the provided image.";
    }
    // Case 2: Text message with history (code modification request)
    else if (!req.file && conversationHistory.length > 0) {
      const previousCode = conversationHistory[0].content; // Get the previous code
      prompt = `Here is the current HTML code:

${previousCode}

User request: "${userMessage}"

Please modify the code according to the user's request and provide the complete updated code. Return only the modified code wrapped in \`\`\`html code blocks.`;
    }
    // Case 3: New image upload (with or without history)
    else if (req.file) {
      prompt =
        "Create new responsive HTML and CSS code that matches this new UI image. Include all necessary styling and layout. Make it fully functional and visually identical to the provided image.";
    } else {
      return res
        .status(400)
        .json({
          error:
            "Invalid request. Please provide an image or a modification request with history.",
        });
    }

    let parts = [prompt];

    // Add image to parts if available (Case 1 and 3)
    if (req.file) {
      const imageBuffer = await fs.readFile(req.file.path);
      const imageBase64 = imageBuffer.toString("base64");
      parts.push({
        inlineData: {
          mimeType: req.file.mimetype,
          data: imageBase64,
        },
      });
    }

    const result = await model.generateContent(parts);
    let response = await result.response.text();

    // Clean up uploaded file if it exists
    if (req.file) {
      await fs.unlink(req.file.path).catch(console.error);
    }

    res.json({
      response,
      case: req.file ? (conversationHistory.length === 0 ? 1 : 3) : 2,
    });
  } catch (error) {
    console.error("Error:", error);
    res.status(500).json({ error: "Failed to generate content" });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

// Create uploads directory if it doesn't exist
fs.mkdir("uploads").catch(() => {});
