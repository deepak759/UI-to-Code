from google.cloud import vision
import io
import json
import requests

# Initialize the Google Cloud Vision client
try:
    client = vision.ImageAnnotatorClient.from_service_account_file('google-cloud.json')
except Exception as e:
    print(f"Error initializing Google Cloud Vision client: {e}")
    exit()

# Load image
image_path = "input.jpg"
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
    
    # Print raw responses for debugging
    print("Label Response:", label_response)
    print("Text Response:", text_response)
    print("Object Response:", object_response)
    print("Face Response:", face_response)
    print("Landmark Response:", landmark_response)
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

# Extract text annotations
try:
    texts = [
        annotation.description for annotation in text_response.text_annotations
    ]
except Exception as e:
    print(f"Error extracting text: {e}")
    texts = []

# Extract object annotations
try:
    objects = [
        {"name": obj.name, "score": obj.score} for obj in object_response.localized_object_annotations
    ]
except Exception as e:
    print(f"Error extracting objects: {e}")
    objects = []

# Extract face detection results (only returning count for privacy concerns)
try:
    face_count = len(face_response.face_annotations)
except Exception as e:
    print(f"Error extracting face count: {e}")
    face_count = 0

# Extract landmark detection results
try:
    landmarks = [
        {"description": landmark.description, "location": landmark.locations[0].lat_lng}
        for landmark in landmark_response.landmark_annotations
    ]
except Exception as e:
    print(f"Error extracting landmarks: {e}")
    landmarks = []

# Structure output data
output_data = {
    "labels": labels,
    "detected_text": texts,
    "objects": objects,
    "face_count": face_count,
    "landmarks": landmarks
}

# Send data to DeepSeek AI model for UI generation
API_URL = "https://api.deepseek.com/chat/completions"
HEADERS = {
    "Content-Type": "application/json",
    "Authorization": "Bearer sk-17bf6fcf373e412ab9f2c096cb3a067f"
}

payload = {
    "model": "deepseek-reasoner",
    "messages": [
        {"role": "system", "content": "You are an AI that generates UI code based on interpreted image data."},
        {"role": "user", "content": f"Generate a user interface design in React or HTML+CSS based on the following image analysis: {json.dumps(output_data, indent=4)}"}
    ],
    "stream": False
}

try:
    response = requests.post(API_URL, headers=HEADERS, json=payload)
    response.raise_for_status()
    ui_code = response.json().get("choices", [{}])[0].get("message", {}).get("content", "No UI generated")
except requests.exceptions.RequestException as e:
    print(f"Error sending request to DeepSeek API: {e}")
    ui_code = ""

# Print or save the generated UI code
print(ui_code)
