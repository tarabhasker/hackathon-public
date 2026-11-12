import { useRef, useState } from 'react'
import { api, assetUrl } from '../../api'
import { squareJpeg } from '../../lib/image'
import { Avatar, Button, Icon, Spinner, useToast } from '../ui'

// Photo picker for your own profile: crops to a square, uploads straight away,
// and reports the new `avatar_url` (or null after removing) through onChange.
export default function AvatarUploader({ name, avatarUrl, onChange }) {
  const input = useRef(null)
  const toast = useToast()
  const [busy, setBusy] = useState(false)

  async function pick(event) {
    const file = event.target.files[0]
    event.target.value = ''
    if (!file) return
    setBusy(true)
    try {
      const body = new FormData()
      body.append('file', await squareJpeg(file), 'avatar.jpg')
      const data = await api('/api/profile/avatar', { method: 'PUT', body })
      onChange(data.avatar_url)
      toast.success('Photo updated')
    } catch (err) {
      toast.error(err.message)
    } finally {
      setBusy(false)
    }
  }

  async function remove() {
    setBusy(true)
    try {
      await api('/api/profile/avatar', { method: 'DELETE' })
      onChange(null)
      toast.success('Photo removed')
    } catch (err) {
      toast.error(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="pf-photo">
      <Avatar name={name} src={assetUrl(avatarUrl)} size={88} tone="primary-soft" />
      <div className="pf-photo__actions">
        <input ref={input} type="file" accept="image/png,image/jpeg,image/webp" onChange={pick} hidden />
        <Button variant="outline" onClick={() => input.current.click()} disabled={busy}>
          {busy ? <Spinner size={14} /> : <Icon name="camera" size={16} />}
          {avatarUrl ? 'Change photo' : 'Upload photo'}
        </Button>
        {avatarUrl && (
          <Button variant="ghost" onClick={remove} disabled={busy}>Remove</Button>
        )}
        <span className="pf-photo__hint">JPEG, PNG or WebP. We crop it to a square.</span>
      </div>
    </div>
  )
}
