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
    console.log("API hit with file:", req.file);

    const uploadedImage = req.file;
    if (!uploadedImage) {
      return res.status(400).json({ error: "No image file provided" });
    }

    const prompt =
      "Create responsive HTML and CSS code that matches this UI design image exactly. Include all necessary styling and layout. Implement all functionality as well.";
    console.log("Reading image file from:", uploadedImage.path);

    const imageBuffer = await fs.readFile(uploadedImage.path);
    console.log("Image buffer created, size:", imageBuffer.length);
    const imageBase64 = imageBuffer.toString("base64");
    console.log("Image converted to base64");

    console.log("Calling Gemini API...");
    const result = await model.generateContent([
      prompt,
      {
        inlineData: {
          mimeType: uploadedImage.mimetype,
          data: imageBase64,
        },
      },
    ]);
    console.log("Gemini API response received");

    // Wait for the response to be fully generated
    const response = await result.response;
    if (!response) {
      throw new Error("No response generated from AI");
    }

    // Get the text content after ensuring response is complete
    const generatedText = await response.text();
    console.log("Generated text length:", generatedText.length);
    console.log("Generated code:", generatedText);

    // Clean up uploaded file
    await fs.unlink(uploadedImage.path).catch(console.error);
    console.log("File cleanup completed");

    // Send response only after everything is complete
    res.json({ response: generatedText });
  } catch (error) {
    console.error("Error in /api/generate:", error);
    // Check if it's a Gemini API error
    if (error.message?.includes("PERMISSION_DENIED")) {
      return res.status(403).json({
        error: "API key or permissions issue",
        details: error.message,
      });
    }
    // Check for file system errors
    if (error.code === "ENOENT") {
      return res.status(500).json({
        error: "File system error",
        details: "Could not read uploaded file",
      });
    }
    res.status(500).json({
      error: "Failed to generate content",
      details: error.message,
    });
  }
});

const PORT = process.env.PORT || 9000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

// Create uploads directory if it doesn't exist
fs.mkdir("uploads").catch(() => {});
