import { useEffect } from "react"
import { useNavigate } from "react-router-dom"
import { signOut } from "firebase/auth"
import { auth } from "../firebase"

export default function LogoutPage() {
  const navigate = useNavigate()

  useEffect(() => {
    signOut(auth).then(() => navigate("/login", { replace: true }))
  }, [navigate])

  return null
}
