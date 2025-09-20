const form = document.getElementById("chat-form");
const input = document.getElementById("user_input");
const chatBox = document.getElementById("chat-box");
const typingBubble = document.getElementById("typing-bubble");
const placeholder = document.getElementById("placeholder");
let guestSessionId = sessionStorage.getItem("guest_session_id");
let history = [];
let isGuest = false;  

window.onload = () => {
    checkSession();
};

form.addEventListener("submit", async (event) => {
   event.preventDefault();
   if (placeholder) {
    placeholder.style.opacity = "0";
    setTimeout(() => placeholder.style.display = "none", 10);
    }
    const text = input.value.trim();
    history.push({ "role": "human", "content": text })
    addMessage(text, "user");
    input.value = ""
    form.classList.add("disabled");  
    input.disabled = true; 
    typingBubble.style.display = "flex";
    chatBox.appendChild(typingBubble);
    let response 
    if (isGuest){
        response = await fetchGuestResponse(text, guestSessionId);
    }
    else {
        response =  await fetchResponse(text);
    }
    showMessage(response)
});

const addMessage = (text, sender) => {
    const msg = document.createElement("div");
    msg.innerHTML = marked.parseInline(text); 
    msg.classList.add("message", sender);
    chatBox.appendChild(msg);
    chatBox.scrollTo({ top: chatBox.scrollHeight, behavior: "smooth" });
};

const showMessage = (response) => {
    chatBox.removeChild(typingBubble);
    if (response.error) {
        const errorBubble = document.createElement("div");
        errorBubble.classList.add("message", "bot");

        const retryBtn = document.createElement("button");
       retryBtn.classList.add("retry-btn");   
       retryBtn.innerHTML = `<i class="fas fa-redo"></i> Retry`; 

        let msg = "";
        switch (response.type) {
            case "network": msg = "Network error. Check your connection."; break;
            case "server": msg = "Server error. Try later."; break;
            case "backend": msg = `Oops! ${response.error}`; break;
            default: msg = "Something went wrong. Try again.";
        }

        errorBubble.innerHTML = msg;
        errorBubble.appendChild(retryBtn);
        chatBox.appendChild(errorBubble);

        retryBtn.addEventListener("click", async () => {
            chatBox.removeChild(errorBubble);
            typingBubble.style.display = "flex";
            chatBox.appendChild(typingBubble);
            const lastUserMessage = history[history.length - 1].content;
            let retryResponse
            if(isGuest){
                retryResponse = await fetchGuestResponse(lastUserMessage,history)
            }
            else{
            retryResponse = await fetchResponse(lastUserMessage);
            }
            showMessage(retryResponse);
        });

    } else {
        history.push({ "role": "ai", "content": response.response });
        addMessage(response.response, "bot");
        form.classList.remove("disabled");
        input.disabled = false;   
    }
}

const fetchGuestResponse = async (text,guestSessionId) => {
try {
        let res = await fetch("http://127.0.0.1:8000/guest-chat", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                user_input: text,
                guest_session_id : guestSessionId
            })
        });

        if (!res.ok) {
            return { error: `Server error: ${res.status}`, type: "server" };
        }

        const data = await res.json();
        if (data.error) {
            return { error: data.error, type: "backend" };
        }
        return { response: data.response.content }; 

    } catch (err) {
        if (err instanceof TypeError) {
            return { error: "Network error, please check your connection.", type: "network" };
        }
        return { error: err.message, type: "other" };
    }
}


const fetchResponse = async (text) => {
    try {
        let res = await fetch("http://127.0.0.1:8000/chat", {
            method: "POST",
            credentials: "include",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                user_input: text
            })
        });

        if (!res.ok) {
            return { error: `Server error: ${res.status}`, type: "server" };
        }

        const data = await res.json();
        if (data.error) {
            return { error: data.error, type: "backend" };
        }
        return { response: data.response.content };

    } catch (err) {
        if (err instanceof TypeError) {
            return { error: "Network error, please check your connection.", type: "network" };
        }
        return { error: err.message, type: "other" };
    }
}

const checkSession = async () => {
       try{
            let response =  await fetch("http://127.0.0.1:8000/check-session",{
                method: "GET",
                credentials: "include"
            });
            if (!response.ok) throw new Error("Network response was not ok");
            const data = await response.json(); 
            console.log(data.new_session)
            if(data.new_session){
                openLoginModal()
            }
        }
        catch(err){
            console.error("Failed to get session:", err);
        }
}

const signupForm = document.getElementById("signup-form");
signupForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    isGuest = false;
    const username = document.getElementById("signup-username").value.trim();
    const email = document.getElementById("signup-email").value.trim();
    const password = document.getElementById("signup-password").value;

    if (!username || !email || !password) {
        let msg = document.getElementById("signup-msg");
        msg.innerText = "Please fill in all fields."
        msg.style.color = "crimson";
        return;
    }
    let result = passwordChecker(password);
    if(result){
        let msg = document.getElementById("signup-msg");
        msg.innerText = result
        msg.style.color = "crimson";
        return;
    }

         try{
            let response =  await fetch("http://127.0.0.1:8000/sign-up",{
                method: "POST",
                credentials: "include",            
                headers: {
                "Content-Type": "application/json"
                },
                body: JSON.stringify({
                   username: username,
                   email: email,
                   password: password
            })
            });
            const data = await response.json();
            const message = data.message;
            const error = data.error;
            if (error) {
               let msg = document.getElementById("signup-msg");
               msg.innerText = error
               msg.style.color = "crimson";
               let email = document.getElementById("signup-email");
               email.style.border = "2px solid crimson";
            } else if (message) {
               sessionStorage.removeItem("guest_session_id");
               closeModal(e.target);
               clearChat();
               notifyUser(message);
            }
        }
        catch(err){
            console.error("Failed to get session:", err);
        }
});

document.getElementById("logout-btn").addEventListener("click", async (e) => {
        try{
             if (isGuest === true) {
                openLoginModal();
                return; 
        }
            let response =  await fetch("http://127.0.0.1:8000/logout",{
                method: "DELETE",
                credentials: "include"
            });
            if (!response.ok) throw new Error("Network response was not ok");
            const data = await response.json(); 
            const message = data.message;
            notifyUser(message)
            setTimeout(() => {
                window.location.reload();
            },1000);
        }
        catch(err){
            console.error("Failed to get session:", err);
        }
    });

document.getElementById("login-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  isGuest = false;
  const email = document.getElementById("login-email").value.trim();
  const password = document.getElementById("login-password").value;
  
  if (!email || !password) {
    let msg = document.getElementById("login-msg");
    msg.innerText = "Please fill in all fields."
    msg.style.color = "crimson";
    return;
    }
        try{
            let response =  await fetch("http://127.0.0.1:8000/sign-in",{
                method: "POST",
                credentials: "include",            
                headers: {
                "Content-Type": "application/json"
                },
                body: JSON.stringify({
                   email: email,
                   password: password
            })
            });
            const data = await response.json(); 
            const message = data.message
            const error = data.error
            if (error) {
               let msg = document.getElementById("login-msg");
               msg.innerText = error
               msg.style.color = "crimson";
               let email = document.getElementById("login-email");
               email.style.border = "2px solid crimson";
            } else if (message) {
               closeModal(e.target);
               sessionStorage.removeItem("guest_session_id");
               clearChat();
               notifyUser(message);
            }
        }
        catch(err){
            console.error("Failed to get session:", err);
        }
});

const updateAuthIcon = (isGuest) => {
    const icon = document.querySelector("#logout-btn i");
    const logoutBtn = document.querySelector("#logout-btn");

    if (isGuest) {
        logoutBtn.title = "Login";
        icon.classList.remove("fa-right-from-bracket"); 
        icon.classList.add("fa-right-to-bracket");     
    } else {
        logoutBtn.title = "Logout";
        icon.classList.remove("fa-right-to-bracket");  
        icon.classList.add("fa-right-from-bracket");   
    }
}
// 🔹 Open Login Modal
const openLoginModal = () => {
  document.getElementById("login-modal-backdrop").classList.remove("hidden");
  document.getElementById("login-guest-btn").focus();
};

// 🔹 Open Signup Modal
const openSignupModal = () => {
  document.getElementById("signup-modal-backdrop").classList.remove("hidden");
  document.getElementById("signup-guest-btn").focus();
};

// 🔹 Close modal (works for ANY modal)
const closeModal = (element) => {
  const backdrop = element.closest(".modal-backdrop");
  if (backdrop) {
    backdrop.classList.add("hidden");
  }
};
document.getElementById("open-signup").addEventListener("click", (e) => {
  e.preventDefault();
  document.getElementById("login-modal-backdrop").classList.add("hidden");
  openSignupModal();
});

document.getElementById("open-login").addEventListener("click", (e) => {
  e.preventDefault();
  document.getElementById("signup-modal-backdrop").classList.add("hidden");
  openLoginModal();
});

// 🔹 Attach close buttons (both modals share class "modal-close")
document.querySelectorAll(".modal-close").forEach((btn) => {
  btn.addEventListener("click", (e) => {
    notifyUser("Logged in as Guest")
    isGuest = true;
    updateAuthIcon(isGuest);
    guestSession()
    closeModal(e.target)
  });
});

document.querySelectorAll(".guest").forEach(btn => {
  btn.addEventListener("click", (e) => {
    isGuest = true;
    notifyUser("Logged in as Guest")
    updateAuthIcon(isGuest);
    guestSession()
    closeModal(e.target);
  });
});

const guestSession = () => {
    if (!guestSessionId) {
     guestSessionId = crypto.randomUUID();
     sessionStorage.setItem("guest_session_id", guestSessionId);
}
}

const notifyUser = (data) => {
    let notification = document.getElementById("notification-text");
    notification.innerText = data; 
    let block = document.getElementById("notification-block");
    block.classList.add("show");  
    setTimeout(() => {
        block.classList.remove("show");  
    }, 3000); 
}

const passwordChecker = (password) => {
    const errors = [];

    if (password.length < 8) {
        errors.push("Password must be at least 8 characters long");
    }

    if (!/[0-9]/.test(password)) {
        errors.push("Password must contain at least one number");
    }

    if (!/[A-Z]/.test(password)) {
        errors.push("Password must contain at least one uppercase letter");
    }

    if (!/[a-z]/.test(password)) {
        errors.push("Password must contain at least one lowercase letter");
    }

    if (!/[^a-zA-Z0-9\s]/.test(password)) {
        errors.push("Password must contain at least one special character");
    }

    return errors.length > 0 ? errors : null;
}

const clearChat = () => {
  chatBox.innerHTML = '';
}

// async function delayedFunc(){
//     var myPromise = new Promise(function(resolve,reject){
//         setTimeout(function(){
//             resolve("Hello after 1 second");
//         },1000);
//     });
//     var result = await myPromise;
//     console.log(result)
// }
// setTimeout(() => {
//     //addMessage("👻 The spirits spoke… and I’m here to entertain you with chills and chuckles!", "bot");
// }, 500);