import { Component, type ReactNode } from "react"
import { TriangleAlert } from "lucide-react"

interface Props { children: ReactNode }
interface State { hasError: boolean }

/**
 * Catches render errors in widget content so one widget with an unexpected data
 * shape degrades to a "couldn't display" message instead of crashing the page.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false }

  static getDerivedStateFromError(): State {
    return { hasError: true }
  }

  componentDidCatch(error: unknown) {
    console.error("Widget render error:", error)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="widget-no-data">
          <TriangleAlert size={24} className="widget-no-data-icon" />
          <span className="body-text">Couldn't display this data</span>
        </div>
      )
    }
    return this.props.children
  }
}
