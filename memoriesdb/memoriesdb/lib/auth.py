#!/usr/bin/env python3
"""
auth.py - Authentication and session management for MemoriesDB

This module handles user authentication, session management, and CSRF protection.
"""

import psycopg
import logging
import secrets
from typing import Dict, Optional

from memoriesdb.lib.config import DSN
from memoriesdb.lib.db import  get_or_create_last_conversation_locked

logger = logging.getLogger(__name__)

# CSRF token storage (in production, use Redis or database)
csrf_tokens = {}

def get_csrf_token(session_token: str) -> str:
    """Get or create a CSRF token for a session
    
    Args:
        session_token: The session token
        
    Returns:
        CSRF token string
    """
    if session_token not in csrf_tokens:
        csrf_tokens[session_token] = secrets.token_urlsafe(32)
    return csrf_tokens[session_token]

def verify_csrf_token(session_token: str, token: str) -> bool:
    """Verify a CSRF token matches the stored token
    
    Args:
        session_token: The session token
        token: The CSRF token to verify
        
    Returns:
        True if token matches, False otherwise
    """
    stored = csrf_tokens.get(session_token)
    if not stored:
        return False
    return secrets.compare_digest(token, stored)

def validate_session(session_token: str) -> Optional[str]:
    """Validate a session token and return the user ID
    
    Args:
        session_token: The session token to validate
        
    Returns:
        User ID if valid, None otherwise
    """
    if not session_token:
        return None
    
    conn = psycopg.connect(DSN)
    cursor = conn.cursor()
    try:
        cursor.execute(
            "SELECT user_id FROM sessions WHERE token = %s AND expires_at > NOW()",
            (session_token,)
        )
        row = cursor.fetchone()
        if row:
            return str(row[0])
        return None
    finally:
        conn.close()

def get_auth_status(session_token: str, device_id: Optional[str] = None) -> Dict:
    """Get authentication status for a session
    
    Args:
        session_token: The session token
        device_id: Optional device ID cookie
        
    Returns:
        Dict with logged_in status, user info, and conversation_id
    """
    if not session_token:
        return {'logged_in': False}
    
    conn = psycopg.connect(DSN)
    cursor = conn.cursor()
    
    try:
        cursor.execute(
            "SELECT s.user_id, u.email FROM sessions s JOIN users u ON s.user_id = u.id WHERE s.token = %s AND s.expires_at > NOW()",
            (session_token,)
        )
        row = cursor.fetchone()
        
        if row:
            user_id = str(row[0])
            email = row[1]
            
            # Get last conversation for this user
            cursor.execute(
                "SELECT id FROM memories WHERE created_by = %s AND kind = 'convo' LIMIT 1",
                (user_id,)
            )
            convo_row = cursor.fetchone()
            conversation_id = str(convo_row[0]) if convo_row else None
            
            return {
                'logged_in': True,
                'user_id': user_id,
                'email': email,
                'conversation_id': conversation_id,
                'device_id': device_id
            }
        else:
            return {'logged_in': False}
    finally:
        conn.close()

def logout(session_token: str) -> Dict:
    """Logout a user by deleting their session
    
    Args:
        session_token: The session token to delete
        
    Returns:
        Dict with status
    """
    if session_token:
        conn = psycopg.connect(DSN)
        cursor = conn.cursor()
        try:
            cursor.execute(
                "DELETE FROM sessions WHERE token = %s",
                (session_token,)
            )
            conn.commit()
        finally:
            conn.close()
    
    return {'status': 'ok'}

def login(email: str, digest: str, device_id: Optional[str] = None) -> Dict:
    """Login a user with email and password digest
    
    Args:
        email: User email
        digest: Password digest
        device_id: Optional device ID cookie
        
    Returns:
        Dict with status, user_id, and session_id
    """
    conn = psycopg.connect(DSN)
    cursor = conn.cursor()
    
    try:
        # Check credentials
        cursor.execute(
            "SELECT id, state FROM users WHERE email = %s AND digest = %s",
            (email, digest)
        )
        row = cursor.fetchone()
        
        if not row:
            return {'status': 'error', 'error': 'Invalid email or password'}
        
        user_id, state = row[0], row[1]
        
        if state != 'active':
            return {'status': 'error', 'error': f'Account is {state}. Please verify your email.'}
        
        user_id = str(user_id)
        
        # Get or create session
        cursor.execute(
            "SELECT id, session_id, token FROM sessions WHERE user_id = %s AND device_id = %s AND expires_at > NOW()",
            (user_id, device_id)
        )
        session = cursor.fetchone()
        
        if session:
            # Refresh existing session
            session_id, session_token = session[1], session[2]
            cursor.execute(
                "UPDATE sessions SET expires_at = NOW() + INTERVAL '24 hours' WHERE id = %s",
                (session[0],)
            )
        else:
            # Create new session
            session_token = secrets.token_urlsafe(32)
            cursor.execute(
                "INSERT INTO sessions (user_id, device_id, token, expires_at) VALUES (%s, %s, %s, NOW() + INTERVAL '24 hours') RETURNING id",
                (user_id, device_id, session_token)
            )
            session_id = str(cursor.fetchone()[0])
        
        conn.commit()
        
        return {'status': 'ok', 'user_id': user_id, 'session_id': session_id, 'session_token': session_token}
    except Exception as e:
        conn.rollback()
        return {'status': 'error', 'error': str(e)}
    finally:
        conn.close()

def register(email: str, digest: str) -> Dict:
    """Register a new user
    
    Args:
        email: User email
        digest: Password digest
        
    Returns:
        Dict with status and user_id
    """
    conn = psycopg.connect(DSN)
    cursor = conn.cursor()
    
    try:
        # Check if user already exists
        cursor.execute(
            "SELECT id FROM users WHERE email = %s",
            (email,)
        )
        if cursor.fetchone():
            return {'status': 'error', 'error': 'Email already registered'}
        
        # Create new user
        cursor.execute(
            "INSERT INTO users (email, digest) VALUES (%s, %s) RETURNING id",
            (email, digest)
        )
        user_id = str(cursor.fetchone()[0])
        conn.commit()
        
        # TODO: Send email verification
        return {'status': 'ok', 'user_id': user_id}
    except Exception as e:
        conn.rollback()
        return {'status': 'error', 'error': str(e)}
    finally:
        conn.close()
