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
    const formatType = req.body.formatType || "css"; // Get format type from request, default to CSS

    const prompt =
      "Create responsive HTML and CSS code that matches this UI and in place of images use random links. Include all necessary styling and layout. Implement all functionality as well.";

    const uploadedImage = req.file;
    const useTestImage = req.query.useTestImage === "true"; // New query parameter

    // Read the uploaded image or use ui.png if specified or no upload
    let imageBuffer;
    if (uploadedImage && !useTestImage) {
      imageBuffer = await fs.readFile(uploadedImage.path);
    } else {
      imageBuffer = await fs.readFile(path.join(__dirname, "ui.png"));
    }
    const imageBase64 = imageBuffer.toString("base64");

    const result = await model.generateContent([
      prompt,
      {
        inlineData: {
          mimeType: uploadedImage ? uploadedImage.mimetype : "image/png",
          data: imageBase64,
        },
      },
    ]);

    let response = await result.response.text();

    // Find all img tags in the response and replace src with Pexels images
    const imgRegex = /<img[^>]+src=["']([^"']+)["'][^>]*>/g;
    const imgTags = response.match(imgRegex) || [];

    // Replace each image source with a Pexels image
    for (const imgTag of imgTags) {
      try {
        const altMatch = imgTag.match(/alt=["']([^"']+)["']/);
        const searchQuery = altMatch ? altMatch[1] : "abstract";
        const pexelsUrl = await getPexelsImageUrl(searchQuery);
        const newImgTag = imgTag.replace(
          /src=["'][^"']+["']/,
          `src="${pexelsUrl}"`
        );
        response = response.replace(imgTag, newImgTag);
      } catch (error) {
        console.error("Error replacing image:", error);
        continue;
      }
    }

    // Clean up uploaded file if it exists
    if (uploadedImage) {
      await fs.unlink(uploadedImage.path).catch(console.error);
    }
    console.log(response);
    res.json({ response });
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
