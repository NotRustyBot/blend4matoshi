import blend_render_info

filepath = "workdir/file.blend"
frame_start, frame_end, scene = blend_render_info.read_blend_rend_chunk(filepath)[0]
print(str(frame_start) +"|"+ str(frame_end))
