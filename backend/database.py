import sqlite3
import bcrypt


USER_DB_PATH = "users.db"
CHAT_DB_PATH = "chat_history.db"

def create_user_db():
    conn = sqlite3.connect(USER_DB_PATH)
    cursor = conn.cursor()
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            session_id TEXT UNIQUE,
            username TEXT NOT NULL,
            email TEXT NOT NULL UNIQUE,
            password TEXT NOT NULL
        )
    ''')
    conn.commit()
    conn.close()
    

def create_chat_history_db():
    conn = sqlite3.connect(CHAT_DB_PATH)
    cursor = conn.cursor()
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS chat_history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            session_id TEXT UNIQUE,
            role TEXT,
            content TEXT,
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    ''')
    conn.commit()
    conn.close()


def add_user(session_id, username, email, password):
    conn = sqlite3.connect(USER_DB_PATH)
    cursor = conn.cursor()
    hashed_pw = bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt())
    try:
        cursor.execute('''
            INSERT INTO users (session_id, username, email, password)
            VALUES (?, ?, ?, ?)
        ''', (session_id, username, email, hashed_pw))
        conn.commit()
    except sqlite3.IntegrityError:
        return False
    finally:
        conn.close()
    return True


def fetch_all_users():
    conn = sqlite3.connect(CHAT_DB_PATH)
    cursor = conn.cursor()
    cursor.execute('SELECT * FROM message_store')
    user = cursor.fetchall()
    conn.close()
    return user
#print(fetch_all_users())

def clear_chat_history():
    pass
def check_email_duplicates(email):
    conn = sqlite3.connect(USER_DB_PATH)
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM users WHERE email = ?", (email,))
    user = cursor.fetchone() 
    conn.close()

    if user:
        return True  
    else:
        return False  


def get_session_id(email):
    conn = sqlite3.connect(USER_DB_PATH)
    cursor = conn.cursor()
    cursor.execute('SELECT session_id FROM users WHERE email = ?',(email,))
    result = cursor.fetchone()
    conn.close()
    if result:
        return result[0]  
    else:
        return None  

def verify_password(email: str, password: str) -> bool:
    conn = sqlite3.connect(USER_DB_PATH)
    cursor = conn.cursor()
    cursor.execute("SELECT password FROM users WHERE email = ?", (email,))
    result = cursor.fetchone()
    conn.close()

    if not result:
        return False  # email not found

    stored_hashed_pw = result[0] 
    return bcrypt.checkpw(password.encode("utf-8"), stored_hashed_pw)


def delete_by_email(email):
    conn = sqlite3.connect(USER_DB_PATH)
    cursor = conn.cursor()
    cursor.execute('DELETE FROM users WHERE email = ?', (email,))
    conn.commit()
    conn.close()    
    
def delete_all_users():
    conn = sqlite3.connect(USER_DB_PATH)
    cursor = conn.cursor()
    cursor.execute('DELETE FROM users')
    conn.commit()
    conn.close()
#delete_all_users()