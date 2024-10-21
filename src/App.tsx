import { ConvexAiChat } from "@/aiChat";
import { Link } from "@/components/typography/link";
import { Button } from "@/components/ui/button";
import { useState } from "react";
import { useMutation, useAction } from "convex/react";
import { api } from "../convex/_generated/api.js";

function App() {
  const [showForm, setShowForm] = useState(false);
  const [url, setUrl] = useState("");
  const [title, setTitle] = useState("");
  const updateDocument = useMutation(api.ingest.load.updateDocument);
  const embedAll = useAction(api.ingest.embed.embedAll);

  const handleUpdateDocument = async () => {
    if (url && title) {
      try {
        await updateDocument({ url, text: title });
        setUrl("");
        setTitle("");
      } catch (error) {
        console.error("Error updating document:", error);
      }
    } else {
      alert("Both fields are required.");
    }
  };

  const handleGenerateEmbedding = async () => {
    await embedAll({});
  };

  return (
    <main className="container max-w-2xl flex flex-col gap-8">
      <h1 className="text-4xl font-extrabold my-8 text-center">
        AI Chat with Convex Vector Search
      </h1>
      <p>Click the button to open the chat window</p>
      <p>
        <ConvexAiChat
          convexUrl={import.meta.env.VITE_CONVEX_URL as string}
          name="Lucky AI Bot"
          infoMessage="AI can make mistakes. Verify answers."
          welcomeMessage="Hey there, what can I help you with?"
          renderTrigger={(onClick) => (
            <Button onClick={onClick}>Open AI chat</Button>
          )}
        />
      </p>
      <p>
        <Button onClick={() => setShowForm(!showForm)}>Update Document</Button>
      </p>
      {showForm && (
        <div>
          <input
            type="text"
            placeholder="URL"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            required
          />
          <input
            type="text"
            placeholder="Title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
          />
          <div className="button-group">
            <Button onClick={handleUpdateDocument}>Submit</Button>
            <span style={{ width: '8px' }}></span> {/* Khoảng cách giữa các nút */}
            <Button onClick={handleGenerateEmbedding}>Generate Embedding</Button>
          </div>
        </div>
      )}
      <p>
        Check out{" "}
        <Link target="_blank" href="https://docs.convex.dev/home">
          Convex docs
        </Link>
      </p>
    </main>
  );
}

export default App;