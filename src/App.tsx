/* eslint-disable @typescript-eslint/ban-ts-comment */
import { Suspense } from 'react'
import {
  useRoutes
} from 'react-router-dom'
import Layout from './layout';
//@ts-expect-error
import routes from '@@react-pages'
import './App.css'

function App() {
  // const [count, setCount] = useState(0)
  // const navigate = useNavigate()
  console.log('routes', routes)

  return (
    <Suspense fallback={<p>Loading...</p>}>
      <Layout>{useRoutes(routes)}</Layout>
    </Suspense>
  )
}

export default App
