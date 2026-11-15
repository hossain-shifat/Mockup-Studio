import { Component, StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.jsx";

// a crash shows a message and a reload button instead of a blank page
class Boundary extends Component {
    state = { err: null };
    static getDerivedStateFromError(err) { return { err }; }
    render() {
        if (!this.state.err) return this.props.children;
        return (
            <div className="h-full flex items-center justify-center p-8">
                <div className="max-w-md text-center space-y-3">
                    <h1 className="font-display text-xl font-semibold">Something went wrong</h1>
                    <p className="text-sm text-base-content/60 break-words">{String(this.state.err.message || this.state.err)}</p>
                    <button className="btn btn-primary btn-sm" onClick={() => location.reload()}>Reload</button>
                </div>
            </div>
        );
    }
}

createRoot(document.getElementById("root")).render(<StrictMode><Boundary><App /></Boundary></StrictMode>);
