import { Link } from 'react-router-dom'
import ProductCard from '../components/ProductCard'
import PageBanner from '../components/PageBanner'
import { useNewArrivals } from '../lib/useNewArrivals'

export default function NewArrivals() {
  const { products, days } = useNewArrivals()

  return (
    <div>
      <PageBanner eyebrow="Just launched" title="New Arrivals" description={`Pieces launched in the last ${days} days.`} />
      <div className="mx-auto max-w-[1400px] px-6 sm:px-10 py-12 sm:py-16">
        {products === null ? (
          <div className="py-16 text-center text-stone">Loading…</div>
        ) : products.length === 0 ? (
          <div className="py-16 text-center">
            <p className="font-display text-3xl text-noir mb-3">Nothing new right now</p>
            <p className="text-stone mb-8">New designs appear here when they launch. In the meantime, explore the full collection.</p>
            <Link to="/shop" className="text-[12px] uppercase tracking-[0.16em] underline underline-offset-4 text-rose-dark">
              Shop all jewellery
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-x-4 sm:gap-x-6 gap-y-10">
            {products.map((p) => <ProductCard key={p.id} product={p} />)}
          </div>
        )}
      </div>
    </div>
  )
}
