export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname.toLowerCase();

    if (path === "/api/contact" && request.method === "POST") {
      return await handleContactForm(request, env);
    }

    return new Response(contactHTML, {
        headers: { "Content-Type": "text/html; charset=UTF-8" }
      });
  }
};

async function handleContactForm(request, env) {
  try {
    const data = await request.json();
    
    console.log("Form data received:", data);

    if (!data.name || !data.email || !data.message) {
      console.log("Missing required fields");
      return Response.json({ success: false, message: "Missing required fields" }, { status: 400 });
    }

    try {
      await env.EMAIL.send({
        from: "patrick@koorevaar.com",
        to: "pkoorevaar@hotmail.com",
        subject: "New contact request",
        text: `Name: ${data.name}\nEmail: ${data.email}\nSubject: ${data.subject}\n\n${data.message}`,
      });
    }
    catch (err) {
      console.error("Email Error:", err.message);
    }

    // Test if DB binding exists
    if (!env.DB) {
      console.log("DB binding is undefined!");
      return Response.json({ success: false, message: "Database not configured" }, { status: 500 });
    }

    const result = await env.DB.prepare(`
      INSERT INTO contacts (name, email, subject, message)
      VALUES (?, ?, ?, ?)
    `).bind(
      data.name,
      data.email,
      data.subject || "",
      data.message
    ).run();

    console.log("Insert successful:", result);

    return Response.json({ 
      success: true, 
      message: "Thank you! Your message has been saved." 
    });

  } catch (err) {
    console.error("D1 Error:", err.message);
    return Response.json({ 
      success: false, 
      message: "Database error: " + err.message 
    }, { status: 500 });
  }
}

const contactHTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Contact | Koorevaar</title>
  <link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 200 200'%3E%3Crect width='200' height='200' rx='40' fill='%231e3a8a'/%3E%3Cpath d='M50 70 L100 110 L150 70' stroke='%23dbeafe' stroke-width='18' fill='none' stroke-linecap='round'/%3E%3Crect x='40' y='65' width='120' height='85' rx='15' fill='none' stroke='%23dbeafe' stroke-width='18'/%3E%3C/svg%3E" type="image/svg+xml">
  <script src="https://cdn.tailwindcss.com"></script>
</head>
<body class="bg-gray-100 py-12">
  <div class="max-w-2xl mx-auto px-6">
    <!-- Home Button -->
    <div class="flex justify-end mb-6">
      <a href="https://www.koorevaar.com" 
         class="flex items-center gap-2 px-5 py-2.5 bg-white hover:bg-gray-50 border border-gray-300 rounded-2xl text-gray-700 hover:text-blue-600 transition font-medium shadow-sm">
        <svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1v-5m10-10l2 2m-2-2v10a1 1 0 01-1 1v-5m-6 0a1 1 0 001-1v5" />
        </svg>
        Home
      </a>
    </div>

    <h1 class="text-4xl font-bold text-center mb-2">Get In Touch</h1>
    <p class="text-center text-gray-600 mb-10">I'm always happy to discuss Azure, Cloud solutions, or my CV.</p>

    <div class="bg-white rounded-2xl shadow p-10">
      <form id="contactForm" class="space-y-6">
        <div>
          <label class="block text-sm font-medium mb-1">Name</label>
          <input type="text" id="name" required 
            class="w-full px-4 py-3 border rounded-xl focus:outline-none focus:border-blue-500">
        </div>
        <div>
          <label class="block text-sm font-medium mb-1">Email</label>
          <input type="email" id="email" required 
            class="w-full px-4 py-3 border rounded-xl focus:outline-none focus:border-blue-500">
        </div>
        <div>
          <label class="block text-sm font-medium mb-1">Subject</label>
          <input type="text" id="subject" required 
            class="w-full px-4 py-3 border rounded-xl focus:outline-none focus:border-blue-500">
        </div>
        <div>
          <label class="block text-sm font-medium mb-1">Message</label>
          <textarea id="message" rows="5" required 
            class="w-full px-4 py-3 border rounded-xl focus:outline-none focus:border-blue-500"></textarea>
        </div>

        <button type="submit" 
          class="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-4 rounded-xl text-lg transition">
          Send Message
        </button>
      </form>

      <div id="status" class="mt-6 text-center"></div>
    </div>
  </div>

  <script>
    document.getElementById('contactForm').addEventListener('submit', async (e) => {
      e.preventDefault();

      const statusDiv = document.getElementById('status');
      const submitBtn = e.target.querySelector('button');

      const formData = {
        name: document.getElementById('name').value.trim(),
        email: document.getElementById('email').value.trim(),
        subject: document.getElementById('subject').value.trim(),
        message: document.getElementById('message').value.trim()
      };

      // Disable button + loading state
      submitBtn.disabled = true;
      submitBtn.textContent = "Sending...";
      statusDiv.innerHTML = '<p class="text-blue-600">Submitting your message...</p>';

      try {
        const res = await fetch('/api/contact', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(formData)
        });

        const result = await res.json();

        if (result.success) {
          statusDiv.innerHTML = \`
            <div class="bg-green-50 border border-green-200 text-green-700 p-5 rounded-2xl">
              Thank you! Your message has been saved successfully.
            </div>\`;
          e.target.reset();
        } else {
          throw new Error(result.message || "Failed to submit");
        }
      } catch (err) {
        statusDiv.innerHTML = \`
          <div class="bg-red-50 border border-red-200 text-red-700 p-5 rounded-2xl">
            \${err.message}
          </div>\`;
      } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = "Send Message";
      }
    });
  </script>
</body>
</html>`