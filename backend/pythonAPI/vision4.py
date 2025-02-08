from google.cloud import vision
import io
import json
import requests
import cv2
import numpy as np

# Initialize the Google Cloud Vision client
try:
    client = vision.ImageAnnotatorClient.from_service_account_file('google-cloud.json')
except Exception as e:
    print(f"Error initializing Google Cloud Vision client: {e}")
    exit()

# Load image
image_path = "input7.png"
try:
    with io.open(image_path, 'rb') as image_file:
        content = image_file.read()
    image = vision.Image(content=content)
except Exception as e:
    print(f"Error loading image: {e}")
    exit()

try:
    # Perform multiple analyses
    label_response = client.label_detection(image=image)
    text_response = client.text_detection(image=image)
    object_response = client.object_localization(image=image)
    face_response = client.face_detection(image=image)
    landmark_response = client.landmark_detection(image=image)
    properties_response = client.image_properties(image=image)
    
    # Print raw responses for debugging
    print("Label Response:", label_response)
    print("Text Response:", text_response)
    print("Object Response:", object_response)
    print("Face Response:", face_response)
    print("Landmark Response:", landmark_response)
    print("Image Properties Response:", properties_response)
except Exception as e:
    print(f"Error performing image analysis: {e}")
    exit()

# Extract label annotations
try:
    labels = [
        {"description": label.description, "score": label.score}
        for label in label_response.label_annotations
    ]
except Exception as e:
    print(f"Error extracting labels: {e}")
    labels = []

# Extract text annotations with positions
try:
    texts = [
        {
            "text": annotation.description,
            "position": {
                "vertices": [
                    {"x": vertex.x, "y": vertex.y}
                    for vertex in annotation.bounding_poly.vertices
                ]
            }
        }
        for annotation in text_response.text_annotations
    ]
except Exception as e:
    print(f"Error extracting text with positions: {e}")
    texts = []

# Extract object annotations with positions
try:
    objects = [
        {
            "name": obj.name,
            "score": obj.score,
            "position": {
                "vertices": [
                    {"x": vertex.x, "y": vertex.y}
                    for vertex in obj.bounding_poly.normalized_vertices
                ]
            }
        }
        for obj in object_response.localized_object_annotations
    ]
except Exception as e:
    print(f"Error extracting objects with positions: {e}")
    objects = []

# Extract face detection results (only returning count for privacy concerns)
try:
    face_count = len(face_response.face_annotations)
except Exception as e:
    print(f"Error extracting face count: {e}")
    face_count = 0

# Extract landmark detection results with positions
try:
    landmarks = [
        {
            "description": landmark.description,
            "location": {"latitude": landmark.locations[0].lat_lng.latitude, 
                        "longitude": landmark.locations[0].lat_lng.longitude},
            "position": {
                "vertices": [
                    {"x": vertex.x, "y": vertex.y}
                    for vertex in landmark.bounding_poly.vertices
                ]
            }
        }
        for landmark in landmark_response.landmark_annotations
    ]
except Exception as e:
    print(f"Error extracting landmarks with positions: {e}")
    landmarks = []

# Extract dominant colors
try:
    colors = [
        {"color": (color.color.red, color.color.green, color.color.blue), "score": color.score}
        for color in properties_response.image_properties_annotation.dominant_colors.colors
    ]
except Exception as e:
    print(f"Error extracting colors: {e}")
    colors = []

# Use OpenCV for additional color analysis
try:
    image_cv = cv2.imread(image_path)
    average_color = image_cv.mean(axis=0).mean(axis=0)
    average_color = (int(average_color[2]), int(average_color[1]), int(average_color[0]))  # Convert to RGB
except Exception as e:
    print(f"Error processing image with OpenCV: {e}")
    average_color = None

# Structure output data
output_data = {
    "labels": labels,
    "detected_text": texts,
    "objects": objects,
    "face_count": face_count,
    "landmarks": landmarks,
    "dominant_colors": colors,
    "average_color": average_color
}

# Send data to DeepInfra API for UI generation with positional info
API_URL = "https://api.deepinfra.com/v1/openai/chat/completions"
HEADERS = {
    "Content-Type": "application/json",
    "Authorization": "Bearer kLYT4ancf82hQwiIeGsW2PCJaGvaJF98"
}

payload = {
    "model": "deepseek-ai/DeepSeek-R1",
    "messages": [
        {"role": "system", "content": "You are an AI that generates UI code based on interpreted image data, including positions."},
        {"role": "user", "content": f"Generate a user interface design in HTML+CSS based on the following image analysis with positions: {json.dumps(output_data, indent=4)}"}
    ]
}

try:
    response = requests.post(API_URL, headers=HEADERS, json=payload)
    response.raise_for_status()
   
    ui_code = response.json().get("choices", [{}])[0].get("message", {}).get("content", "No UI generated")
except requests.exceptions.RequestException as e:
    print(f"Error sending request to DeepInfra API: {e}")
    ui_code = ""

# Print or save the generated UI code
print(ui_code)
