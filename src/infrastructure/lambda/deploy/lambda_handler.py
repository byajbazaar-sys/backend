import json
import logging
import boto3
import os
from pathlib import Path
from typing import Dict, Any
from datetime import datetime

# Import your parser class
from resume_parser import DualPDFDocxParserWithLinksAndImages, ResumeParsingError

# Configure logging
logger = logging.getLogger()
logger.setLevel(logging.INFO)

# Initialize S3 client
s3_client = boto3.client('s3')

# Initialize parser (global to reuse across invocations)
parser = None

# Configuration
RESPONSE_MAX_SIZE = 6_000_000  # 6MB Lambda response limit (leave buffer)
INCLUDE_RAW_TEXT = True  # Set to False to exclude raw_text from response
UPLOAD_LARGE_RESULTS = True  # Upload results > 1MB to S3 instead


def initialize_parser():
    """Initialize parser once for Lambda container reuse"""
    global parser
    if parser is None:
        logger.info("Initializing resume parser...")
        parser = DualPDFDocxParserWithLinksAndImages()
        logger.info("Parser initialized successfully")


def download_file_from_s3(bucket: str, key: str, local_path: str) -> str:
    """
    Download file from S3 to Lambda's /tmp directory
    
    Args:
        bucket: S3 bucket name
        key: S3 object key
        local_path: Local file path in /tmp
    
    Returns:
        Local file path
    """
    try:
        logger.info(f"Downloading s3://{bucket}/{key} to {local_path}")
        s3_client.download_file(bucket, key, local_path)
        logger.info(f"File downloaded successfully to {local_path}")
        return local_path
    except Exception as e:
        logger.error(f"Error downloading file from S3: {e}")
        raise


def upload_result_to_s3(bucket: str, key: str, data: Dict[str, Any]) -> str:
    """
    Upload parsed result as JSON to S3
    
    Args:
        bucket: S3 bucket name
        key: S3 object key for the result
        data: Parsed resume data
    
    Returns:
        S3 URI of uploaded result
    """
    try:
        json_data = json.dumps(data, indent=2, ensure_ascii=False, default=str)
        json_size = len(json_data.encode('utf-8'))
        
        logger.info(f"Uploading result to S3 (size: {json_size / 1024 / 1024:.2f}MB)")
        
        s3_client.put_object(
            Bucket=bucket,
            Key=key,
            Body=json_data.encode('utf-8'),
            ContentType='application/json'
        )
        
        s3_uri = f"s3://{bucket}/{key}"
        logger.info(f"Result uploaded to {s3_uri}")
        return s3_uri
    except Exception as e:
        logger.error(f"Error uploading result to S3: {e}")
        raise


def get_response_size(data: Dict[str, Any]) -> int:
    """Get the size of the data when serialized to JSON"""
    try:
        json_str = json.dumps(data, ensure_ascii=False, default=str)
        return len(json_str.encode('utf-8'))
    except Exception as e:
        logger.warning(f"Error calculating response size: {e}")
        return 0


def prepare_response_data(
    parsed_result: Dict[str, Any],
    include_raw_text: bool = True,
    include_images_base64: bool = True
) -> Dict[str, Any]:
    """
    Prepare response data with all extracted information
    
    Args:
        parsed_result: Full parsing result from parser
        include_raw_text: Whether to include raw text content
        include_images_base64: Whether to include base64 encoded images
    
    Returns:
        Prepared response data
    """
    
    # Start with extracted data
    response_data = {
        "status": parsed_result.get("status", "success"),
        "timestamp": datetime.now().isoformat(),
        "metadata": parsed_result.get("metadata", {}),
        
        # Personal Information
        "personal_info": parsed_result.get("personal_info", {}),
        
        # Professional Information
        "professional_info": parsed_result.get("professional_info", {}),
        
        # Skills and Expertise
        "skills_and_expertise": parsed_result.get("skills_and_expertise", {}),
        
        # Education
        "education": parsed_result.get("education", []),
        
        # Experience
        "experience": parsed_result.get("experience", []),
        
        # Hyperlinks
        "hyperlinks": parsed_result.get("hyperlinks", []),
    }
    
    # Include raw text if requested
    if include_raw_text and "raw_text" in parsed_result:
        response_data["raw_text"] = parsed_result["raw_text"]
    
    # Include images if requested
    if include_images_base64 and "images" in parsed_result:
        response_data["images"] = parsed_result["images"]
    else:
        # If not including base64, just provide image metadata
        images_metadata = []
        for img in parsed_result.get("images", []):
            images_metadata.append({
                "image_name": img.get("image_name"),
                "image_format": img.get("image_format"),
                "image_size": img.get("image_size"),
                "page_number": img.get("page_number"),
                "extraction_method": img.get("extraction_method")
                # Exclude image_base64 to save space
            })
        if images_metadata:
            response_data["images_metadata"] = images_metadata
    
    # Add file info if present
    if "file_path" in parsed_result:
        response_data["file_path"] = parsed_result["file_path"]
    
    return response_data


def lambda_handler(event, context):
    """
    AWS Lambda handler for resume parsing with full data extraction
    
    Event formats supported:
    
    1. S3 Event (triggered by S3 upload):
       {
         "Records": [{
           "s3": {
             "bucket": {"name": "my-bucket"},
             "object": {"key": "resumes/resume.pdf"}
           }
         }]
       }
    
    2. Direct invocation (API Gateway or test):
       {
         "bucket": "my-bucket",
         "key": "resumes/resume.pdf",
         "output_bucket": "my-results-bucket" (optional),
         "include_raw_text": true (optional, default: true),
         "include_images": true (optional, default: true),
         "upload_to_s3": true (optional, default: true)
       }
    
    Returns:
        {
          "statusCode": 200,
          "body": JSON string with ALL parsed data including raw_text and images
        }
    """
    try:
        # Initialize parser
        initialize_parser()
        
        # Parse event to get bucket and key
        bucket = None
        key = None
        output_bucket = None
        include_raw_text = INCLUDE_RAW_TEXT
        include_images = True
        upload_to_s3 = UPLOAD_LARGE_RESULTS
        
        # Check if this is an S3 event trigger
        if 'Records' in event:
            logger.info("Processing S3 event trigger")
            record = event['Records'][0]
            bucket = record['s3']['bucket']['name']
            key = record['s3']['object']['key']
            output_bucket = bucket
            
        # Check if this is a direct invocation
        elif 'bucket' in event and 'key' in event:
            logger.info("Processing direct invocation")
            bucket = event['bucket']
            key = event['key']
            output_bucket = event.get('output_bucket', bucket)
            include_raw_text = event.get('include_raw_text', INCLUDE_RAW_TEXT)
            include_images = event.get('include_images', True)
            upload_to_s3 = event.get('upload_to_s3', UPLOAD_LARGE_RESULTS)
        
        else:
            return {
                'statusCode': 400,
                'body': json.dumps({
                    'status': 'error',
                    'error': 'Invalid event format. Expected S3 event or {bucket, key}',
                    'event_received': event
                }, default=str)
            }
        
        logger.info(f"Processing file: s3://{bucket}/{key}")
        logger.info(f"Options - include_raw_text: {include_raw_text}, include_images: {include_images}")
        
        # Validate file extension
        file_extension = Path(key).suffix.lower()
        if file_extension not in ['.pdf', '.docx']:
            return {
                'statusCode': 400,
                'body': json.dumps({
                    'status': 'error',
                    'error': f'Unsupported file type: {file_extension}',
                    'supported_types': ['.pdf', '.docx']
                })
            }
        
        # Download file to /tmp
        local_filename = f"/tmp/{Path(key).name}"
        download_file_from_s3(bucket, key, local_filename)
        
        # Parse the resume (include raw text)
        logger.info(f"Parsing resume: {local_filename}")
        parsed_result = parser.parse(local_filename, include_raw_text=True)
        
        # Check if parsing was successful
        if parsed_result.get('status') != 'success':
            logger.error(f"Parsing failed: {parsed_result.get('error_message')}")
            return {
                'statusCode': 500,
                'body': json.dumps({
                    'status': 'error',
                    'error': parsed_result.get('error_message', 'Unknown parsing error'),
                    'file': key,
                    'timestamp': datetime.now().isoformat()
                })
            }
        
        # Prepare response data
        response_data = prepare_response_data(
            parsed_result,
            include_raw_text=include_raw_text,
            include_images_base64=include_images
        )
        
        # Add summary statistics
        response_data["summary"] = {
            "emails": len(response_data.get('personal_info', {}).get('emails', [])),
            "phone_numbers": len(response_data.get('personal_info', {}).get('phone_numbers', [])),
            "skills": len(response_data.get('skills_and_expertise', {}).get('technical_skills', [])),
            "certifications": len(response_data.get('skills_and_expertise', {}).get('certifications', [])),
            "hyperlinks": len(response_data.get('hyperlinks', [])),
            "images": len(response_data.get('images', [])) if include_images else 0,
            "education_entries": len(response_data.get('education', [])),
            "experience_entries": len(response_data.get('experience', []))
        }
        
        # Calculate response size
        response_size = get_response_size(response_data)
        logger.info(f"Response size: {response_size / 1024 / 1024:.2f}MB")
        
        # Check if response exceeds Lambda limit
        if response_size > RESPONSE_MAX_SIZE and upload_to_s3:
            logger.warning(
                f"Response size ({response_size / 1024 / 1024:.2f}MB) exceeds Lambda limit. "
                f"Uploading full result to S3 instead."
            )
            
            # Upload full result to S3
            output_key = f"parsed/{Path(key).stem}_parsed_full.json"
            result_uri = upload_result_to_s3(output_bucket, output_key, response_data)
            
            # Return metadata response with S3 link
            metadata_response = {
                "status": "success",
                "message": "Resume parsed successfully. Full results uploaded to S3.",
                "source_file": f"s3://{bucket}/{key}",
                "result_file": result_uri,
                "result_size_mb": round(response_size / 1024 / 1024, 2),
                "summary": response_data["summary"]
            }
            
            return {
                'statusCode': 200,
                'headers': {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*'
                },
                'body': json.dumps(metadata_response, default=str)
            }
        
        # Response fits within Lambda limits - return full data
        logger.info("Resume parsing completed successfully")
        
        return {
            'statusCode': 200,
            'headers': {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            },
            'body': json.dumps(response_data, default=str)
        }
    
    except ResumeParsingError as e:
        logger.error(f"Resume parsing error: {e}")
        return {
            'statusCode': 422,
            'body': json.dumps({
                'status': 'error',
                'error': str(e),
                'error_type': 'ResumeParsingError',
                'timestamp': datetime.now().isoformat()
            })
        }
    
    except Exception as e:
        logger.error(f"Unexpected error: {e}", exc_info=True)
        return {
            'statusCode': 500,
            'body': json.dumps({
                'status': 'error',
                'error': str(e),
                'error_type': type(e).__name__,
                'timestamp': datetime.now().isoformat()
            })
        }