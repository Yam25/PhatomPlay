import os
import uuid
import traceback

from dotenv import load_dotenv
from pydantic import BaseModel
from backend.database import add_user, check_email_duplicates, get_session_id, verify_password
from sqlalchemy import create_engine

from fastapi import FastAPI,Response,Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from langchain_core.prompts import ChatPromptTemplate, MessagesPlaceholder
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_core.chat_history import InMemoryChatMessageHistory
from langchain_core.runnables.history import RunnableWithMessageHistory
from langchain_community.chat_message_histories import SQLChatMessageHistory


load_dotenv()
gemini_api_key = os.getenv("GEMINI_API_KEY")


engine = create_engine("sqlite:///chat_history.db")


app = FastAPI()
app.add_middleware(
    CORSMiddleware,
    allow_origins=["https://didactic-space-happiness-5w7j9497qv737v76-5500.app.github.dev"],  
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
) 


llm = ChatGoogleGenerativeAI(
    model="gemini-2.5-flash",
    google_api_key=gemini_api_key,
    temperature=0.5,
)


system_prompt = """
"You are PhantomPlay — an AI chatbot with a delightful mix of horror and comedy.
Speak in a playful, slightly eerie style. Respond to the user naturally, as a chatbot would, never referencing being a host or a show."
Your goals:
1. Answer questions clearly and helpfully in short sentences.
2. Always add a small horror-comedy pun, joke, or eerie comment.
3. Always add a short horror-comedy twist, pun, or comment related to the topic.
4. If the question is about movies (especially latest releases), 
   give the relevant information AND a spooky-humorous remark about it.
5. Keep responses concise unless the user asks for detail.
6. Be suitable for a general audience (no graphic violence, no adult content).

Examples:
- User: "What’s the weather like?"
  PhantomPlay: "Cloudy... perfect for lurking behind misty windows. Oh, and 21°C."
- User: "Recommend a horror movie."
  PhantomPlay: "Try 'The Others' — subtle, chilling, and won’t follow you home. Probably."
- User: "Tell me a joke."
  PhantomPlay: "Why don’t graveyards ever get overcrowded? Because people are just dying to get in."

Remember: The user should feel entertained and slightly spooked, no matter the topic.
"""


prompt = ChatPromptTemplate.from_messages([
    ("system",system_prompt),
    MessagesPlaceholder(variable_name="history"),
    ("user","{user_input}")
])


chain = prompt | llm


session_store: dict[str,InMemoryChatMessageHistory] = {}


class CustomSQLChatMessageHistory(SQLChatMessageHistory):
    """
    Extends SQLChatMessageHistory to automatically add a `created_at` timestamp
    to each stored message.
    """

    def add_message(self, message):
        """
        Override the add_message method to inject timestamp into the row.
        """
        # Ensure message is a dict (LangChain always uses dict for JSON messages)
        if isinstance(message, dict):
            # Add created_at field manually
            import datetime
            message["_created_at"] = datetime.datetime.utcnow().isoformat()

        # Call the original add_message
        super().add_message(message)


class ChatRequest(BaseModel):
    user_input : str


class GuestRequest(BaseModel):
    user_input : str
    guest_session_id : str
    

class SignUpRequest(BaseModel):
    username : str
    email : str
    password : str


class SignInRequest(BaseModel):
    email : str
    password : str


@app.post("/guest-chat")
def guest_endpoint(request: GuestRequest):
    try:
        user_input = request.user_input
        guest_session_id = request.guest_session_id
        response = guest_chat_response(user_input, guest_session_id)
        return {"response" : response}
    except Exception  as e :
        traceback.print_exc()
        return JSONResponse(content={"error": "Internal server error"}, status_code=500)



@app.post("/chat")
def llm_endpoint(request: ChatRequest,req:Request):
    try:
        user_input = request.user_input
        session_id = req.cookies.get("session_id")
        if session_id:
            llm_response = user_chat_response(user_input, session_id)
        return {"response" : llm_response}
    except Exception  as e :
        traceback.print_exc() 
        return JSONResponse(content={"error": "Internal server error"}, status_code=500)

@app.get("/check-session")
def check_session(request: Request):
    session_id = request.cookies.get("session_id")
    if session_id:
        return{"new_session":False}
    else:
        return{"new_session":True}



@app.post("/sign-up")
def sign_up(request: SignUpRequest, response: Response):
    username = request.username.strip()
    email = request.email.strip().lower()
    password = request.password

    if not username or not email or not password:
        return JSONResponse(
            content={"error": "All fields (username, email, password) are required"},
            status_code=400
        )

    if check_email_duplicates(email):
        return JSONResponse(
            content={"error": "User with this email already exists, Please Sign In"},
            status_code=400
        )

    try:
        session_data = generate_session(response)
        session_id = session_data["session_id"]

        success = add_user(session_id, username, email, password)

        if not success:
            return JSONResponse(
                content={"error": "Failed to create user in the database"},
                status_code=500
            )

        return{"message": "Registered successfully, Start Chatting!"}

    except Exception as e:
        traceback.print_exc()
        return JSONResponse(
            content={"error": "Internal server error"},
            status_code=500
        )
  
        
@app.post("/sign-in")
def sign_in(request: SignInRequest, response: Response):
    try:
        email = request.email
        password = request.password

        if not check_email_duplicates(email):
            return JSONResponse(
                content={"error": "User with this email doesn't exist, Please Sign Up"},
                status_code=400
            )
        
        if not verify_password(email, password):
            return JSONResponse(
                content={"error": "Incorrect password"},
                status_code=401
            )

        session_id = get_session_id(email)
        response.set_cookie(
            key="session_id",
            value=session_id,
            max_age=60*60*24,
            httponly=True,
            secure=True,
            path="/",
            samesite="lax"
        )
        return {"message": "Logged in Successfully! Continue Chatting"}

    except Exception:
        traceback.print_exc()
        return JSONResponse(content={"error": "Internal server error"}, status_code=500)



@app.delete("/logout")
def logout(response: Response):
    response.set_cookie(
        key="session_id",
        value="",
        max_age=0, 
        httponly=True,
        secure=True,
        path="/",
        samesite="lax"
    )
    return{"message" : "Logged out successfully"}

def generate_session(response: Response):
    session_id = str(uuid.uuid4())  
    response.set_cookie(
        key="session_id",
        value=session_id,
        max_age=60*60*24,  
        httponly=True,
        secure=True,
        path="/",
        samesite="lax"
    )
    return {"session_id": session_id}


def get_guest_history(session_id: str):
    if session_id not in session_store:
        session_store[session_id] = InMemoryChatMessageHistory()
    return session_store[session_id]

def get_user_history(session_id: str):
    return SQLChatMessageHistory(session_id=session_id, connection=engine)

def guest_chat_response(user_input: str, session_id: str):
        chain_with_memory = RunnableWithMessageHistory(
            runnable=chain,
            get_session_history=get_guest_history,
            input_messages_key="user_input",
            history_messages_key="history"
        )
        llm_response = chain_with_memory.invoke(
            {"user_input": user_input},
            config={"configurable": {"session_id": session_id}},
        )
        return llm_response


def user_chat_response(user_input: str, session_id: str):
   
    # Pass it to RunnableWithMessageHistory
    chain_with_memory = RunnableWithMessageHistory(
        runnable=chain,
        get_session_history=get_user_history,
        input_messages_key="user_input",
        history_messages_key="history"
    )

    # Generate response
    llm_response = chain_with_memory.invoke(
        {"user_input": user_input},
        config={"configurable": {"session_id": session_id}},
    )

    return llm_response
