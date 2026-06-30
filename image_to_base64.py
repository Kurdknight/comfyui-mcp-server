import base64
import os

def image_to_base64(image_path):
    """Converts an image file to a base64 encoded string."""
    try:
        with open(image_path, "rb") as image_file:
            encoded_string = base64.b64encode(image_file.read()).decode('utf-8')
        return encoded_string
    except FileNotFoundError:
        return f"Error: Image file not found at '{image_path}'"
    except Exception as e:
        return f"An error occurred: {e}"

if __name__ == "__main__":
    # --- Instructions ---
    # 1. Make sure this script is in the same directory as your image file.
    # 2. Change the 'image.png' to your image's filename if it's different.
    # 3. Run this script from your terminal: python image_to_base64.py
    # The base64 string will be printed to the console.
    
    # Get the directory where the script is located
    script_dir = os.path.dirname(os.path.abspath(__file__))
    
    # IMPORTANT: Replace 'image.png' with the actual name of your image file.
    image_filename = 'image.png'
    
    image_path = os.path.join(script_dir, image_filename)
    
    base64_value = image_to_base64(image_path)
    
    print(f"Base64 value for {image_filename}:\n")
    print(base64_value)
