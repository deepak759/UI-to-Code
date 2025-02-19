const express = require("express");
const { GoogleGenerativeAI } = require("@google/generative-ai");
const cors = require("cors");
const path = require("path");
const { createClient } = require("pexels");
const multer = require("multer");
require("dotenv").config();
const fs = require("fs").promises;

const app = express();
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));
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
    const uiDescription = req.body.uiDescription || "";
    const conversationHistory = req.body.history
      ? JSON.parse(req.body.history)
      : [];

    let prompt;
    let parts = [];

    // New Case: Initial UI description without image
    if (uiDescription && !req.file && conversationHistory.length === 0) {
      prompt = `Create responsive HTML + CSS code for the following UI description:
${uiDescription}

Requirements:
- Create modern, responsive HTML and CSS code
- Use semantic HTML5 elements
- Include all necessary styling inline or in a style tag
- Make it visually appealing and professional
- Ensure mobile responsiveness
- Use modern CSS features and flexbox/grid layouts where appropriate

Please provide the complete code wrapped in \`\`\`html code blocks.`;

      parts = [prompt];
    }
    // Case 1: Initial image upload (no history)
    else if (req.file && conversationHistory.length === 0) {
      prompt =
        "Create responsive HTML + CSS code that matches this UI image. Include all necessary styling and layout. Make it fully functional and visually identical to the provided image.";

      // Add image to parts
      const imageBuffer = await fs.readFile(req.file.path);
      const imageBase64 = imageBuffer.toString("base64");
      parts = [
        prompt,
        {
          inlineData: {
            mimeType: req.file.mimetype,
            data: imageBase64,
          },
        },
      ];
    }
    // Case 2: Text message with history (code modification request)
    else if (!req.file && conversationHistory.length > 0) {
      // Format the complete conversation history for context
      const conversationContext = conversationHistory
        .map((msg) => {
          if (msg.role === "user" && msg.type === "image") {
            return `${msg.role.toUpperCase()}: [Uploaded Image]`;
          }
          return `${msg.role.toUpperCase()}: ${msg.content}`;
        })
        .join("\n\n");

      // Find the code that needs to be modified
      const targetCode = conversationHistory
        .filter(
          (msg) =>
            msg.role === "assistant" &&
            (msg.content.includes("<html") ||
              msg.content.includes("<!DOCTYPE") ||
              msg.content.includes("<body"))
        )
        .pop()?.content;

      prompt = `Complete conversation history for context:
${conversationContext}

Current code to modify:
${targetCode || "No previous code found"}

User's new request: "${userMessage}"

Please modify the code according to the user's request while maintaining the context of the entire conversation. Return the complete updated code wrapped in \`\`\`html code blocks. Ensure all existing functionality is preserved while implementing the requested changes.`;

      // If there's an image in history, add it to parts
      const lastImage = conversationHistory.find(
        (msg) =>
          msg.role === "user" &&
          msg.type === "image" &&
          msg.content &&
          msg.content.imageUrl
      );

      if (lastImage && lastImage.content.imageUrl) {
        try {
          // Extract base64 and MIME type from data URL
          const matches = lastImage.content.imageUrl.match(
            /^data:([A-Za-z-+/]+);base64,(.+)$/
          );

          if (matches && matches.length === 3) {
            const mimeType = matches[1];
            const base64Data = matches[2];

            // Validate MIME type is an image type
            if (mimeType.startsWith("image/")) {
              parts = [
                prompt,
                {
                  inlineData: {
                    mimeType: mimeType,
                    data: base64Data,
                  },
                },
              ];
            } else {
              parts = [prompt];
              console.warn("Invalid MIME type detected:", mimeType);
            }
          } else {
            parts = [prompt];
            console.warn("Invalid image data URL format");
          }
        } catch (error) {
          console.error("Error processing image data:", error);
          parts = [prompt];
        }
      } else {
        parts = [prompt];
      }
    }
    // Case 3: New image upload (with history)
    else if (req.file) {
      const conversationContext = conversationHistory
        .map((msg) => {
          if (msg.role === "user" && msg.type === "image") {
            return `${msg.role.toUpperCase()}: [Uploaded Image]`;
          }
          return `${msg.role.toUpperCase()}: ${msg.content}`;
        })
        .join("\n\n");

      prompt = `Previous conversation context:
${conversationContext}

Now, create new responsive HTML + CSS code that matches this new UI image. Include all necessary styling and layout. Make it fully functional and visually identical to the provided image.`;

      // Add new image to parts
      const imageBuffer = await fs.readFile(req.file.path);
      const imageBase64 = imageBuffer.toString("base64");
      parts = [
        prompt,
        {
          inlineData: {
            mimeType: req.file.mimetype,
            data: imageBase64,
          },
        },
      ];
    } else {
      return res.status(400).json({
        error:
          "Invalid request. Please provide an image, UI description, or a modification request with history.",
      });
    }

    const result = await model.generateContent(parts);
    let response = await result.response.text();

    // Clean up uploaded file if it exists
    if (req.file) {
      await fs.unlink(req.file.path).catch(console.error);
    }

    // Clean the response to extract only HTML code
    function extractHtmlCode(text) {
      // If response contains code blocks, extract the HTML
      if (text.includes("```html")) {
        const match = text.match(/```html\n?([\s\S]*?)\n?```/);
        return match ? match[1].trim() : text;
      }
      // If response starts with <!DOCTYPE or <html, assume it's pure HTML
      if (
        text.trim().startsWith("<!DOCTYPE") ||
        text.trim().startsWith("<html")
      ) {
        return text.trim();
      }
      // If no code blocks found but contains HTML tags, extract everything between DOCTYPE and closing html tag
      if (text.includes("<!DOCTYPE") && text.includes("</html>")) {
        const start = text.indexOf("<!DOCTYPE");
        const end = text.indexOf("</html>") + 7;
        return text.slice(start, end).trim();
      }
      return text;
    }

    // Clean the response
    response = extractHtmlCode(response);

    // Process image URLs
    if (response.includes('src="') || response.includes("background-image")) {
      // Replace src attributes
      const imgRegex = /src="([^"]+)"/g;
      const matches = [...response.matchAll(imgRegex)];

      for (const match of matches) {
        const originalSrc = match[1];
        const searchQuery =
          originalSrc.split("/").pop().split(".")[0] || "placeholder";
        const pexelsUrl = await getPexelsImageUrl(searchQuery);
        response = response.replace(originalSrc, pexelsUrl);
      }

      // Replace background-image URLs
      const bgRegex = /background-image:\s*url\(['"]([^'"]+)['"]\)/g;
      const bgMatches = [...response.matchAll(bgRegex)];

      for (const match of bgMatches) {
        const originalUrl = match[1];
        const searchQuery =
          originalUrl.split("/").pop().split(".")[0] || "background";
        const pexelsUrl = await getPexelsImageUrl(searchQuery);
        response = response.replace(originalUrl, pexelsUrl);
      }
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
